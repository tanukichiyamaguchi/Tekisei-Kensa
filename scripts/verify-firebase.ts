// 実 Firebase プロジェクトに対する実装時確認（08 D08-33、R-22、09 §6.4）。pnpm firebase:verify
//
//   pnpm firebase:verify --confirm-project <プロジェクト ID>
//
// Emulator と本番の挙動差（09 §6.4 の 1・2・3・4・6・7・23・24）を、実プロジェクトで 1 回確認する。
// 一時的な Auth ユーザー 1 件と一時コレクション `_verifyFirebase` の文書を作り、終了時に削除する。
// プロジェクトは 1 つだけで運用するため（10 K-13）本番プロジェクトに対して実行する。既存のデータには触れない。
// 通常は GitHub Actions の firebase-ops（task = verify）から実行する（10 K-12）。
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { Timestamp } from "firebase-admin/firestore";

import type { Viewer } from "../lib/auth/claims";
import { SESSION_COOKIE_MAX_AGE_MS } from "../lib/auth/session-cookie";
import { getSessionByTokenHash } from "../lib/db/repositories/assessment-sessions-repository";
import { listAdminUsers } from "../lib/db/repositories/admin-users-repository";
import { countAiAnalysesSince } from "../lib/db/repositories/ai-analyses-repository";
import { countRecentAuditLogs } from "../lib/db/repositories/audit-logs-repository";
import { findOrganizationByInviteTokenHash } from "../lib/db/repositories/organizations-repository";
import {
  fetchPopulation,
  listResults,
  listResultsForClassification,
} from "../lib/db/repositories/results-repository";
import { listUsageLogs } from "../lib/db/repositories/usage-logs-repository";
import { adminAuth, adminFirestore } from "../lib/firebase/admin";
import { firebaseErrorCode } from "../lib/services/firebase-errors";
import { firebaseAdminEnv } from "../lib/utils/env";
import { isEntryPoint, runMain, UsageError } from "./lib/cli";
import { loadDotEnvLocal } from "./lib/load-env";

export type CheckStatus = "成立" | "不成立" | "要確認";
export interface CheckResult {
  readonly id: string; // 09 §6.4 の番号など
  readonly title: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

export interface VerifyOptions {
  readonly apiKey: string;
  /** Auth REST の接続先。実プロジェクトは https://identitytoolkit.googleapis.com、Emulator は http://{host}/identitytoolkit.googleapis.com */
  readonly identityToolkitBase: string;
  /** API キーに HTTP リファラー制限がある場合に送る Referer（任意） */
  readonly referer?: string | undefined;
}

const PROBE_COLLECTION = "_verifyFirebase";
const DAY_MS = 24 * 60 * 60 * 1000;

function describeError(error: unknown): string {
  const code = firebaseErrorCode(error);
  return `${code ?? (error as Error)?.name ?? "error"}: ${(error as Error)?.message ?? String(error)}`.slice(
    0,
    300,
  );
}

async function identityToolkit(
  options: VerifyOptions,
  method: "signInWithPassword" | "signUp",
  body: Record<string, unknown>,
): Promise<{ ok: boolean; idToken?: string; error?: string }> {
  const res = await fetch(
    `${options.identityToolkitBase}/v1/accounts:${method}?key=${encodeURIComponent(options.apiKey)}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(options.referer ? { referer: options.referer } : {}),
      },
      body: JSON.stringify({ ...body, returnSecureToken: true }),
    },
  );
  const json = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (res.ok && json.idToken) return { ok: true, idToken: json.idToken };
  return { ok: false, error: json.error?.message ?? `HTTP ${res.status}` };
}

function decodePayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload ?? "", "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

const waitNextSecond = () => new Promise((r) => setTimeout(r, 1100 - (Date.now() % 1000)));

/** Firestore 側の確認（1・2・3 と、デプロイ済みインデックスでリポジトリの全クエリが通ること） */
async function checkFirestore(results: CheckResult[], runId: string): Promise<void> {
  const col = adminFirestore().collection(PROBE_COLLECTION);
  const now = Timestamp.now();
  const docs = {
    nullDeleted: {
      runId,
      kind: "probe",
      deletedAt: null,
      m: { a: 1.5, b: -2, c: 0.1 + 0.2 },
      createdAt: now,
    },
    setDeleted: { runId, kind: "probe", deletedAt: now, m: { a: 1 }, createdAt: now },
    missingDeleted: { runId, kind: "probe", m: { a: 1 }, createdAt: now },
  };
  for (const [id, data] of Object.entries(docs)) await col.doc(`${runId}-${id}`).set(data);

  try {
    const snap = await col.where("runId", "==", runId).where("deletedAt", "==", null).get();
    const ids = snap.docs.map((d) => d.id.replace(`${runId}-`, "")).sort();
    results.push({
      id: "1",
      title: 'where("deletedAt", "==", null) が null を明示した文書にだけ一致する',
      status: JSON.stringify(ids) === JSON.stringify(["nullDeleted"]) ? "成立" : "不成立",
      detail: `一致した文書: ${ids.join(", ") || "なし"}（期待: nullDeleted のみ。フィールド欠落の文書は一致しない）`,
    });
  } catch (error) {
    results.push({
      id: "1",
      title: "deletedAt == null の一致",
      status: "不成立",
      detail: describeError(error),
    });
  }

  try {
    const snap = await col
      .where("runId", "==", runId)
      .where("kind", "==", "probe")
      .select("m")
      .get();
    const m = snap.docs.find((d) => d.id.endsWith("-nullDeleted"))?.get("m") as
      Record<string, number> | undefined;
    const ok = m !== undefined && m.a === 1.5 && m.b === -2 && m.c === 0.1 + 0.2;
    results.push({
      id: "2",
      title: "select() で map フィールド全体が射影される（倍精度も不変）",
      status: ok ? "成立" : "不成立",
      detail: `取得した m: ${JSON.stringify(m)}`,
    });
  } catch (error) {
    results.push({
      id: "2",
      title: "select() の map 射影",
      status: "不成立",
      detail: describeError(error),
    });
  }

  try {
    await col
      .where("runId", "==", runId)
      .where("kind", "==", "probe")
      .where("deletedAt", "==", null)
      .get();
    results.push({
      id: "3a",
      title: "等価条件だけの複合クエリ（3 条件）は複合インデックスなしで実行できる",
      status: "成立",
      detail: "_verifyFirebase には複合インデックスを定義していない",
    });
  } catch (error) {
    results.push({
      id: "3a",
      title: "等価条件だけの複合クエリ",
      status: "不成立",
      detail: describeError(error),
    });
  }

  try {
    await col.where("runId", "==", runId).orderBy("createdAt", "desc").get();
    results.push({
      id: "3b",
      title:
        "未定義の複合インデックスが必要なクエリ（等価 + 並び替え）は失敗する（本番の強制を確認する対照）",
      status: "要確認",
      detail:
        "失敗しなかった（Emulator はインデックスを強制しないためこの結果になる。実プロジェクトでこの結果なら、同名のインデックスが存在しないかコンソールで確認する）",
    });
  } catch (error) {
    const code = firebaseErrorCode(error);
    results.push({
      id: "3b",
      title: "未定義の複合インデックスが必要なクエリは失敗する（対照）",
      status: code === "failed-precondition" ? "成立" : "要確認",
      detail: describeError(error),
    });
  }

  // デプロイ済みの firestore.indexes.json でリポジトリの全クエリ（02 §7.1 の Q1〜Q14）が通ること（H-01 の補助）
  const orgId = `verify${runId}`;
  const owner: Viewer = { uid: "verify", organizationId: orgId, role: "owner" };
  const admin: Viewer = { ...owner, role: "admin" };
  const queries: Array<[string, () => Promise<unknown>]> = [
    [
      "Q1 fetchPopulation(組織)",
      () => fetchPopulation({ organizationId: orgId, scope: { kind: "organization" } }),
    ],
    [
      "Q2 fetchPopulation(チーム)",
      () => fetchPopulation({ organizationId: orgId, scope: { kind: "team", teamCode: "A" } }),
    ],
    ["Q3 listResults(owner)", () => listResults({ viewer: owner })],
    ["Q4 listResults(admin)", () => listResults({ viewer: admin })],
    ["Q3 listResultsForClassification", () => listResultsForClassification({ viewer: owner })],
    [
      "Q5 listUsageLogs(owner, desc)",
      () => listUsageLogs({ viewer: owner, order: "desc", offset: 0, limit: 1 }),
    ],
    [
      "Q5 listUsageLogs(owner, asc)",
      () => listUsageLogs({ viewer: owner, order: "asc", offset: 0, limit: 1 }),
    ],
    [
      "Q6 listUsageLogs(admin, desc)",
      () => listUsageLogs({ viewer: admin, order: "desc", offset: 0, limit: 1 }),
    ],
    [
      "Q6 listUsageLogs(admin, asc)",
      () => listUsageLogs({ viewer: admin, order: "asc", offset: 0, limit: 1 }),
    ],
    ["Q8 listAdminUsers", () => listAdminUsers(orgId)],
    [
      "Q9 findOrganizationByInviteTokenHash",
      () => findOrganizationByInviteTokenHash("0".repeat(64)),
    ],
    [
      "Q10 getSessionByTokenHash",
      () =>
        getSessionByTokenHash({
          organizationId: orgId,
          sessionTokenHash: "0".repeat(64),
          now: new Date(),
        }),
    ],
    [
      "Q11 countRecentAuditLogs",
      () =>
        countRecentAuditLogs({
          organizationId: orgId,
          action: "respondent.register",
          ipAddress: "203.0.113.1",
          since: new Date(Date.now() - 600_000),
        }),
    ],
    [
      "Q14 countAiAnalysesSince",
      () => countAiAnalysesSince({ organizationId: orgId, since: new Date(Date.now() - DAY_MS) }),
    ],
  ];
  const failed: string[] = [];
  for (const [label, run] of queries) {
    try {
      await run();
    } catch (error) {
      failed.push(`${label}（${describeError(error)}）`);
    }
  }
  results.push({
    id: "3c",
    title: "デプロイ済みのインデックスでリポジトリの全クエリ（Q1〜Q14）が実行できる",
    status: failed.length === 0 ? "成立" : "不成立",
    detail: failed.length === 0 ? `${queries.length} 件すべて成功` : `失敗: ${failed.join(" / ")}`,
  });
}

/** Auth 側の確認（4・6・7・23・24） */
async function checkAuth(
  results: CheckResult[],
  options: VerifyOptions,
  runId: string,
): Promise<void> {
  const email = `verify-firebase-${runId}@example.com`;
  const password = randomBytes(24).toString("base64url");
  let uid: string;
  try {
    uid = (await adminAuth().createUser({ email, password, emailVerified: true })).uid;
    results.push({
      id: "7b",
      title: "Admin SDK の createUser は自己登録の無効化の影響を受けない",
      status: "成立",
      detail: "作成できた",
    });
  } catch (error) {
    results.push({
      id: "7b",
      title: "Admin SDK の createUser",
      status: "不成立",
      detail: describeError(error),
    });
    return;
  }

  try {
    const signUp = await identityToolkit(options, "signUp", {
      email: `verify-signup-${runId}@example.com`,
      password: randomBytes(24).toString("base64url"),
    });
    results.push({
      id: "7a",
      title: "自己登録（クライアントからの accounts:signUp）が拒否される",
      status: signUp.ok ? "不成立" : "成立",
      detail: signUp.ok
        ? "登録できてしまった（Firebase コンソールで自己登録を無効化すること）"
        : `拒否: ${signUp.error}`,
    });
    if (signUp.ok) {
      const created = await adminAuth()
        .getUserByEmail(`verify-signup-${runId}@example.com`)
        .catch(() => null);
      if (created) await adminAuth().deleteUser(created.uid);
    }

    const signIn = await identityToolkit(options, "signInWithPassword", { email, password });
    if (!signIn.ok || !signIn.idToken) {
      results.push({
        id: "4",
        title: "ID トークンの取得",
        status: "不成立",
        detail: `ログインできない: ${signIn.error}（API キーの制限がある場合は --referer を指定）`,
      });
      return;
    }
    const idToken = signIn.idToken;
    const authTime = decodePayload(idToken).auth_time;
    results.push({
      id: "23",
      title: "ID トークンの auth_time は Unix 秒",
      status:
        typeof authTime === "number" && Math.abs(authTime - Date.now() / 1000) < 600
          ? "成立"
          : "不成立",
      detail: `auth_time = ${String(authTime)}`,
    });

    const details: string[] = [];
    let fourOk = true;
    try {
      await adminAuth().createSessionCookie(idToken, { expiresIn: SESSION_COOKIE_MAX_AGE_MS });
      details.push("7 日: 発行できた");
    } catch (error) {
      fourOk = false;
      details.push(`7 日: ${describeError(error)}`);
    }
    try {
      await adminAuth().createSessionCookie(idToken, { expiresIn: 14 * DAY_MS });
      details.push("14 日: 発行できた");
    } catch (error) {
      fourOk = false;
      details.push(`14 日: ${describeError(error)}`);
    }
    try {
      await adminAuth().createSessionCookie(idToken, { expiresIn: 14 * DAY_MS + 1000 });
      fourOk = false;
      details.push("14 日 + 1 秒: 発行できてしまった");
    } catch (error) {
      details.push(`14 日 + 1 秒: 拒否（${firebaseErrorCode(error) ?? "error"}）`);
    }
    results.push({
      id: "4",
      title: "createSessionCookie の expiresIn は 7 日・14 日で発行でき、14 日を超えると拒否される",
      status: fourOk ? "成立" : "不成立",
      detail: details.join(" / "),
    });

    const cookie = await adminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_COOKIE_MAX_AGE_MS,
    });
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    results.push({
      id: "24",
      title: "セッション Cookie に email クレームが含まれる",
      status: decoded.email === email ? "成立" : "不成立",
      detail: `email クレーム: ${decoded.email === email ? "あり（一致）" : String(decoded.email)}`,
    });

    await waitNextSecond();
    await adminAuth().revokeRefreshTokens(uid);
    const revoked = await adminAuth()
      .verifySessionCookie(cookie, true)
      .then(() => "受理された")
      .catch((e: unknown) => `拒否（${firebaseErrorCode(e) ?? "error"}）`);

    const again = await identityToolkit(options, "signInWithPassword", { email, password });
    let disabledResult = "未確認（再ログインに失敗）";
    if (again.ok && again.idToken) {
      const cookie2 = await adminAuth().createSessionCookie(again.idToken, {
        expiresIn: SESSION_COOKIE_MAX_AGE_MS,
      });
      await adminAuth().updateUser(uid, { disabled: true });
      disabledResult = await adminAuth()
        .verifySessionCookie(cookie2, true)
        .then(() => "受理された")
        .catch((e: unknown) => `拒否（${firebaseErrorCode(e) ?? "error"}）`);
    }
    results.push({
      id: "6",
      title: "verifySessionCookie(cookie, true) が失効後・無効化ユーザーの Cookie を拒否する",
      status: revoked.startsWith("拒否") && disabledResult.startsWith("拒否") ? "成立" : "不成立",
      detail: `revokeRefreshTokens 後: ${revoked} / disabled 後: ${disabledResult}`,
    });
  } finally {
    await adminAuth()
      .deleteUser(uid)
      .catch(() => undefined);
  }
}

export async function verifyFirebase(options: VerifyOptions): Promise<readonly CheckResult[]> {
  const runId = randomBytes(6).toString("hex");
  const results: CheckResult[] = [];
  try {
    await checkFirestore(results, runId);
    await checkAuth(results, options, runId);
  } finally {
    const probe = await adminFirestore()
      .collection(PROBE_COLLECTION)
      .where("runId", "==", runId)
      .get();
    const batch = adminFirestore().batch();
    for (const d of probe.docs) batch.delete(d.ref);
    await batch.commit();
  }
  return results;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { values } = parseArgs({
    options: { "confirm-project": { type: "string" }, referer: { type: "string" } },
    strict: true,
  });
  const env = firebaseAdminEnv();
  const emulator = Boolean(env.FIRESTORE_EMULATOR_HOST);
  if (!emulator && values["confirm-project"] !== env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new UsageError(
      `接続先のプロジェクト ID を --confirm-project で指定してください（現在の接続先: ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}）`,
    );
  }
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey)
    throw new UsageError(
      "NEXT_PUBLIC_FIREBASE_API_KEY を設定してください（Auth の REST API に使う）",
    );
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  console.log(
    `接続先: ${emulator ? "Firebase Emulator" : "Firebase プロジェクト"} ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`,
  );
  const results = await verifyFirebase({
    apiKey,
    identityToolkitBase: authEmulator
      ? `http://${authEmulator}/identitytoolkit.googleapis.com`
      : "https://identitytoolkit.googleapis.com",
    referer: values.referer,
  });
  for (const r of results) console.log(`[${r.status}] ${r.id}. ${r.title}\n    ${r.detail}`);
  if (results.some((r) => r.status === "不成立")) process.exitCode = 1;
}

if (isEntryPoint(import.meta.url)) void runMain(main);

// scripts/backfill-m7.ts（11-2 §3.1、11-1 §3.6、11-6 §3.1、11-7 §3.1、11-8 §3.5）: M7-list-32、M7-exam-33、
// M7-ai-37 のバックフィルの分、M7-misc-20 のうち既読の手順。処理関数を import して Emulator に対して実行し、
// 最後に CLI（pnpm m7:backfill と同じ tsx 起動）を子プロセスで実行する（I-09 と同じ）。
// M7 より前の文書は、送信や作成で作った文書から M7 で足した項目を消して作る（例外的な直接書き込み。08 D08-18）
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";

import { COLLECTIONS, type CollectionName } from "@/lib/db/collections";
import { softDeleteAdminUser } from "@/lib/db/repositories/admin-users-repository";
import { softDeleteRespondent } from "@/lib/db/repositories/respondents-repository";
import { adminFirestore } from "@/lib/firebase/admin";

import { backfillM7, type BackfillM7Counts } from "@/scripts/backfill-m7";
import {
  createAdmin,
  createOrganizationWithOwner,
  cyclicAnswers,
  meta,
  submitAnswerSet,
  uniformAnswers,
  type TestAdmin,
  type TestOrganization,
} from "../helpers/fixtures";
import { getDocForTest, listDocs } from "../helpers/firestore";

type Doc = Record<string, unknown>;

const RESULT_M7_FIELDS = [
  "employmentStatus",
  "hiredOn",
  "leftOn",
  "staffRole",
  "previousResultId",
  "trainingAiStatus",
  "trainingAiStartedAt",
  "trainingAiError",
  "latestTrainingAiAnalysisId",
  "trainingContext",
  "longitudinalAiStatus",
  "longitudinalAiStartedAt",
  "longitudinalAiError",
  "latestLongitudinalAiAnalysisId",
] as const;

const AI_INITIAL = {
  trainingAiStatus: "not_generated",
  trainingAiStartedAt: null,
  trainingAiError: null,
  latestTrainingAiAnalysisId: null,
  trainingContext: null,
  longitudinalAiStatus: "not_generated",
  longitudinalAiStartedAt: null,
  longitudinalAiError: null,
  latestLongitudinalAiAnalysisId: null,
} as const;

/** 例外的な直接書き込み: M7 で足した項目を消して、M7 より前の形の文書にする */
async function stripFields(collection: CollectionName, id: string, fields: readonly string[]) {
  await adminFirestore()
    .collection(collection)
    .doc(id)
    .update(Object.fromEntries(fields.map((f) => [f, FieldValue.delete()])));
}

/** コレクションの全文書（ID → 中身） */
async function snapshotOf(collection: CollectionName): Promise<Map<string, Doc>> {
  return new Map((await listDocs(collection)).map((d) => [d.id, d.data]));
}

async function snapshotAll(): Promise<Record<string, Map<string, Doc>>> {
  const out: Record<string, Map<string, Doc>> = {};
  for (const name of Object.values(COLLECTIONS)) out[name] = await snapshotOf(name);
  return out;
}

function capture() {
  const lines: string[] = [];
  return { lines, print: (line: string) => lines.push(line) };
}

const ZERO: BackfillM7Counts = {
  resultsEmployment: 0,
  resultsPreviousResult: 0,
  resultsAi: 0,
  resultsWritten: 0,
  adminUsersAnnouncements: 0,
};

let org: TestOrganization;
let owner: TestAdmin;
type Submitted = Awaited<ReturnType<typeof submitAnswerSet>>;
/** M7 より前の求職者の結果・既存スタッフの結果・論理削除した結果 */
let legacyApplicant: Submitted;
let legacyExecutive: Submitted;
let legacyDeleted: Submitted;
/** 区分などの値を持つ結果（触らない） */
let withValues: Submitted;
/** 区分だけがあり、ほかの M7 の項目が無い結果 */
let employmentOnly: Submitted;
/** M7 の項目がそろった結果（触らない） */
let fresh: Submitted;
let legacyAdmin: TestAdmin;
let deletedAdmin: TestAdmin;
let readAdmin: TestAdmin;
let freshAdmin: TestAdmin;
let legacyOrgId: string;
let initial: Record<string, Map<string, Doc>>;

beforeAll(async () => {
  ({ org, owner } = await createOrganizationWithOwner("移行サロン"));
  legacyApplicant = await submitAnswerSet(org, cyclicAnswers(), { name: "移行 太郎" });
  legacyExecutive = await submitAnswerSet(org, uniformAnswers(4), {
    kind: "executive",
    name: "移行 次郎",
  });
  legacyDeleted = await submitAnswerSet(org, uniformAnswers(2), { name: "移行 三郎" });
  withValues = await submitAnswerSet(org, uniformAnswers(3), { name: "移行 四郎" });
  employmentOnly = await submitAnswerSet(org, uniformAnswers(5), { name: "移行 五郎" });
  fresh = await submitAnswerSet(org, uniformAnswers(1), { name: "移行 六郎" });
  for (const r of [legacyApplicant, legacyExecutive, legacyDeleted]) {
    await stripFields(COLLECTIONS.results, r.resultId, RESULT_M7_FIELDS);
  }
  await softDeleteRespondent({
    respondentId: legacyDeleted.respondentId,
    viewer: { uid: owner.uid, organizationId: org.organizationId, role: "owner" },
    meta,
  });
  // 例外的な直接書き込み: 退職・前回の結果・生成済みなどの値を持つ結果にする
  await adminFirestore()
    .collection(COLLECTIONS.results)
    .doc(withValues.resultId)
    .update({
      employmentStatus: "left",
      hiredOn: "2024-04-01",
      leftOn: "2026-03-31",
      staffRole: "leader",
      previousResultId: legacyApplicant.resultId,
      trainingAiStatus: "completed",
      longitudinalAiStatus: "failed",
      longitudinalAiError: "timeout",
    });
  await stripFields(
    COLLECTIONS.results,
    employmentOnly.resultId,
    RESULT_M7_FIELDS.filter((f) => f !== "employmentStatus"),
  );
  await adminFirestore()
    .collection(COLLECTIONS.results)
    .doc(employmentOnly.resultId)
    .update({ employmentStatus: "employed" });

  legacyAdmin = owner;
  deletedAdmin = await createAdmin(org, "admin", "削除 管理者");
  readAdmin = await createAdmin(org, "admin", "既読 管理者");
  freshAdmin = await createAdmin(org, "super_admin", "新規 管理者");
  for (const a of [legacyAdmin, deletedAdmin]) {
    await stripFields(COLLECTIONS.adminUsers, a.uid, ["dismissedAnnouncements"]);
  }
  await softDeleteAdminUser({ uid: deletedAdmin.uid });
  await adminFirestore()
    .collection(COLLECTIONS.adminUsers)
    .doc(readAdmin.uid)
    .update({ "dismissedAnnouncements.ai_training": Timestamp.fromMillis(1_790_000_000_000) });

  // 招待トークンの平文の無い組織（M7 より前の形。backfill-m7 はまだ作り直さない）
  const legacyOrg = await createOrganizationWithOwner("招待移行前サロン");
  legacyOrgId = legacyOrg.org.organizationId;
  await stripFields(COLLECTIONS.organizations, legacyOrgId, ["inviteToken"]);

  initial = await snapshotAll();
});

describe("backfill-m7 --dry-run", () => {
  it("書き込まずに、書いたときと同じ件数だけを出す（2 件ずつのページ）", async () => {
    const out = capture();
    const counts = await backfillM7({ dryRun: true, pageSize: 2 }, { print: out.print });
    expect(counts).toEqual({
      resultsEmployment: 3,
      resultsPreviousResult: 4,
      resultsAi: 4,
      resultsWritten: 4,
      adminUsersAnnouncements: 2, // 項目を消したオーナーと削除済みの管理者
    });
    expect(await snapshotAll()).toEqual(initial);
    expect(out.lines).toContain("--dry-run: 書き込まずに件数だけを出します");
    expect(out.lines).toContain("results の区分・入社日・退職日・役職: 3 件");
    expect(out.lines).toContain("書く予定の文書: results 4 件、adminUsers 2 件");
  });
});

describe("backfill-m7（書き込み）", () => {
  let counts: BackfillM7Counts;
  let lines: string[];
  let after: Record<string, Map<string, Doc>>;

  beforeAll(async () => {
    const out = capture();
    lines = out.lines;
    counts = await backfillM7({ dryRun: false, pageSize: 2 }, { print: out.print });
    after = await snapshotAll();
  });

  it("件数は --dry-run と同じ", () => {
    expect(counts).toEqual({
      resultsEmployment: 3,
      resultsPreviousResult: 4,
      resultsAi: 4,
      resultsWritten: 4,
      adminUsersAnnouncements: 2,
    });
  });

  it("M7-list-32: 項目の無い結果に受検者区分どおりの区分と null を書く（論理削除済みを含む）", async () => {
    const results = after[COLLECTIONS.results]!;
    expect(results.get(legacyApplicant.resultId)).toMatchObject({
      employmentStatus: "candidate",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
    expect(results.get(legacyExecutive.resultId)).toMatchObject({
      employmentStatus: "employed",
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
    const deleted = results.get(legacyDeleted.resultId)!;
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted).toMatchObject({ employmentStatus: "candidate", hiredOn: null });
    // updatedAt を書く
    const before = initial[COLLECTIONS.results]!.get(legacyApplicant.resultId)!;
    expect(
      (results.get(legacyApplicant.resultId)!.updatedAt as Timestamp).toMillis() >
        (before.updatedAt as Timestamp).toMillis(),
    ).toBe(true);
  });

  it("M7-exam-33: M7 より前の results に previousResultId: null が入る", () => {
    const results = after[COLLECTIONS.results]!;
    for (const r of [legacyApplicant, legacyExecutive, legacyDeleted]) {
      const doc = results.get(r.resultId)!;
      expect(Object.hasOwn(doc, "previousResultId")).toBe(true);
      expect(doc.previousResultId).toBeNull();
    }
  });

  it("M7-ai-37: 項目の無い結果に AI の 9 項目の作成時の値を書き、採用向けの 4 項目は変わらない", () => {
    const results = after[COLLECTIONS.results]!;
    for (const r of [legacyApplicant, legacyExecutive, legacyDeleted]) {
      const doc = results.get(r.resultId)!;
      const before = initial[COLLECTIONS.results]!.get(r.resultId)!;
      expect(doc).toMatchObject(AI_INITIAL);
      for (const f of [
        "aiGenerationStatus",
        "aiGenerationStartedAt",
        "aiGenerationError",
        "latestAiAnalysisId",
      ]) {
        expect(doc[f], f).toEqual(before[f]);
      }
    }
  });

  it("項目のある文書は変わらない（退職などの値、文書 ID の previousResultId、生成済みの状態）。区分だけある文書は区分に触らない", () => {
    const results = after[COLLECTIONS.results]!;
    expect(results.get(withValues.resultId)).toEqual(
      initial[COLLECTIONS.results]!.get(withValues.resultId),
    );
    expect(results.get(fresh.resultId)).toEqual(initial[COLLECTIONS.results]!.get(fresh.resultId));
    const partial = results.get(employmentOnly.resultId)!;
    expect(partial.employmentStatus).toBe("employed");
    // employmentStatus がある文書は、ほかの 3 つが無くても触らない（11-2 §3.1）
    for (const f of ["hiredOn", "leftOn", "staffRole"]) expect(partial, f).not.toHaveProperty(f);
    expect(partial).toMatchObject({ previousResultId: null, ...AI_INITIAL });
  });

  it("M7-misc-20 のうち既読の手順: dismissedAnnouncements の無い管理者（削除済みを含む）に {} を書き、既読のある管理者は変わらない", () => {
    const users = after[COLLECTIONS.adminUsers]!;
    expect(users.get(legacyAdmin.uid)!.dismissedAnnouncements).toEqual({});
    const deleted = users.get(deletedAdmin.uid)!;
    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.dismissedAnnouncements).toEqual({});
    expect(users.get(readAdmin.uid)).toEqual(initial[COLLECTIONS.adminUsers]!.get(readAdmin.uid));
    expect(users.get(freshAdmin.uid)).toEqual(initial[COLLECTIONS.adminUsers]!.get(freshAdmin.uid));
  });

  it("organizations・respondents・assessmentSessions・usageLogs・aiAnalyses・auditLogs は変えない（招待トークンの無い組織も無いまま）", async () => {
    for (const name of [
      COLLECTIONS.organizations,
      COLLECTIONS.respondents,
      COLLECTIONS.assessmentSessions,
      COLLECTIONS.usageLogs,
      COLLECTIONS.aiAnalyses,
      COLLECTIONS.auditLogs,
    ]) {
      expect(after[name], name).toEqual(initial[name]);
    }
    expect(await getDocForTest(COLLECTIONS.organizations, legacyOrgId)).not.toHaveProperty(
      "inviteToken",
    );
    expect(
      [...after[COLLECTIONS.auditLogs]!.values()].filter(
        (d) => d.action === "organization.rotate_invite_token",
      ),
    ).toHaveLength(0);
  });

  it("出力は手順ごとの件数だけで、文書 ID・氏名・メールアドレス・招待トークンが無い", () => {
    expect(lines).toEqual([
      "results の区分・入社日・退職日・役職: 3 件",
      "results の前回の結果（previousResultId）: 4 件",
      "results の AI の 3 系統: 4 件",
      "adminUsers のお知らせの既読: 2 件",
      "書いた文書: results 4 件、adminUsers 2 件",
    ]);
    const text = lines.join("\n");
    const ids = [
      ...Object.values(initial).flatMap((m) => [...m.keys()]),
      org.organizationId,
      owner.uid,
    ];
    for (const id of ids) expect(text).not.toContain(id);
    for (const secret of ["移行", "@example.com", org.inviteToken]) {
      expect(text).not.toContain(secret);
    }
  });

  it("2 回目の実行では何も書かない（updatedAt も変わらない）。件数は 0", async () => {
    const out = capture();
    expect(await backfillM7({ dryRun: false }, { print: out.print })).toEqual(ZERO);
    expect(await snapshotAll()).toEqual(after);
    expect(out.lines.at(-1)).toBe("書いた文書: results 0 件、adminUsers 0 件");
    expect(await backfillM7({ dryRun: true, pageSize: 1 }, { print: () => undefined })).toEqual(
      ZERO,
    );
  });

  it("ページの大きさは 1〜400", async () => {
    for (const pageSize of [0, 401, 1.5]) {
      await expect(
        backfillM7({ dryRun: true, pageSize }, { print: () => undefined }),
      ).rejects.toThrow(RangeError);
    }
  });
});

describe("backfill-m7 の CLI（子プロセス）", () => {
  it("pnpm m7:backfill --dry-run は接続先と件数だけを出し、書き込まない。知らない引数は失敗する", async () => {
    const before = await snapshotAll();
    const { stdout } = await promisify(execFile)("pnpm", ["-s", "m7:backfill", "--dry-run"], {
      env: { ...process.env },
      timeout: 60_000,
    });
    expect(stdout).toContain("接続先: Firebase Emulator");
    expect(stdout).toContain("--dry-run: 書き込まずに件数だけを出します");
    expect(stdout).toContain("書く予定の文書: results 0 件、adminUsers 0 件");
    expect(await snapshotAll()).toEqual(before);

    const error = await promisify(execFile)("pnpm", ["-s", "m7:backfill", "--force"], {
      env: { ...process.env },
      timeout: 60_000,
    }).then(
      () => null,
      (e: unknown) => e as { code?: number },
    );
    expect(error?.code).toBe(1);
  });
});

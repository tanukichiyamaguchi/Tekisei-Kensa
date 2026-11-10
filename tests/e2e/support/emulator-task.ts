// E2E から Admin SDK（Emulator）を使う処理。Playwright のローダーは firebase-admin を読み込めないため、
// tsx の子プロセスで実行し、結果を JSON で標準出力に返す（support/admin.ts から呼ぶ）
import { Timestamp } from "firebase-admin/firestore";

import { registerAndSave, seedLocal } from "../../../scripts/seed-local";
import { randomAnswers, uniformAnswers } from "../../../scripts/lib/synthetic-answers";
import { createAdminAccount } from "@/lib/auth/admin-accounts";
import { COLLECTIONS } from "@/lib/db/collections";
import { submitSession } from "@/lib/db/repositories/assessment-sessions-repository";
import { createOrganization } from "@/lib/db/repositories/organizations-repository";
import { adminAuth, adminFirestore } from "@/lib/firebase/admin";
import { scoreAnswers } from "@/lib/scoring/score";
import type { AnswerMap } from "@/lib/scoring/types";

const meta = { ipAddress: "127.0.0.1", userAgent: "e2e" } as const;
let emailSeq = 0;
const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${process.pid}-${++emailSeq}@example.com`;

async function submitAnswers(
  organizationId: string,
  index: number,
  answers: AnswerMap,
): Promise<{ resultId: string; respondentId: string }> {
  const registered = await registerAndSave(organizationId, index, "applicant", answers, 4);
  const { resultId } = await submitSession({ sessionId: registered.sessionId, meta });
  return { resultId, respondentId: registered.respondentId };
}

/** オーナー（と指定があれば管理者 admin）のアカウントを作り、ログイン用のパスワードを設定する（ローカル専用。02 §13.2） */
async function createLoginAccounts(
  organizationId: string,
  password: string,
  roles: ReadonlyArray<"owner" | "admin">,
): Promise<Record<"owner" | "admin", string>> {
  const emails: Record<"owner" | "admin", string> = { owner: "", admin: "" };
  for (const role of roles) {
    const email = uniqueEmail(`e2e-${role}`);
    const { uid } = await createAdminAccount({
      email,
      displayName: role === "owner" ? "テストテスト 院長" : "テストテスト 管理者",
      organizationId,
      role,
      actorKind: "system",
    });
    await adminAuth().updateUser(uid, { password });
    emails[role] = email;
  }
  return emails;
}

async function run(task: string | undefined, args: string[]): Promise<unknown> {
  const db = adminFirestore();
  switch (task) {
    case "create-organization": {
      const org = await createOrganization({
        name: args[0] ?? "E2E 歯科医院",
        code: null,
        customerNumber: null,
      });
      return { organizationId: org.organizationId };
    }
    case "expire-session": {
      // 期限切れの再現（08 §3.4.3 E-04）。E2E に限った直接書き込み
      await db
        .collection(COLLECTIONS.assessmentSessions)
        .doc(args[0] ?? "")
        .update({ tokenExpiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
      return { ok: true };
    }
    case "respondent-of-session": {
      const session = await db
        .collection(COLLECTIONS.assessmentSessions)
        .doc(args[0] ?? "")
        .get();
      const respondentId = session.get("respondentId") as string;
      const respondent = await db.collection(COLLECTIONS.respondents).doc(respondentId).get();
      return {
        name: respondent.get("name") as string,
        phoneNumber: respondent.get("phoneNumber") as string,
        occupationCode: respondent.get("occupationCode") as number,
        kind: respondent.get("kind") as string,
      };
    }
    case "result-of-session": {
      // 受験のデータ（11-1 §2.7.2〜§2.7.4）: 結果の ID、前回の結果、受検者区分の複製と区分、利用履歴の件数
      // （M7-exam-41・49 ほか。読むだけ）
      const sessionId = args[0] ?? "";
      const results = await db
        .collection(COLLECTIONS.results)
        .where("sessionId", "==", sessionId)
        .get();
      const result = results.docs[0];
      if (!result) return { resultCount: 0 };
      const respondentId = result.get("respondentId") as string;
      const usageLogs = await db
        .collection(COLLECTIONS.usageLogs)
        .where("respondentId", "==", respondentId)
        .get();
      return {
        resultCount: results.size,
        resultId: result.id,
        previousResultId: (result.get("previousResultId") as string | null | undefined) ?? null,
        respondentKind: result.get("respondentKind") as string,
        employmentStatus: result.get("employmentStatus") as string,
        usageLogCount: usageLogs.size,
        usageLogRespondentKind: (usageLogs.docs[0]?.get("respondentKind") as string) ?? null,
      };
    }
    case "count-results-of-session": {
      const snap = await db
        .collection(COLLECTIONS.results)
        .where("sessionId", "==", args[0] ?? "")
        .count()
        .get();
      return { count: snap.data().count };
    }
    case "seed-admin-org": {
      // 管理画面の E2E 用の組織（02 §13.2 の seed:local と同じ構成）。メールアドレスはテストごとに変える
      const ownerEmail = uniqueEmail("e2e-owner");
      const adminEmail = uniqueEmail("e2e-admin");
      const summary = await seedLocal(
        { ownerEmail, adminEmail, password: args[0] ?? "" },
        {
          baseUrl: process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000",
          print: () => {},
        },
      );
      return { ...summary, ownerEmail, adminEmail };
    }
    case "seed-grade-a-org": {
      // E-14 の色確認用: 全問 1 と全問 3 の 2 人（03 T-12: 全問 1 の比較で評価 A）。
      // 信頼係数・リスクを 90 にするのは E2E に限った直接書き込み
      const org = await createOrganization({
        name: "E2E 色確認歯科",
        code: null,
        customerNumber: null,
      });
      const ownerEmail = uniqueEmail("e2e-color-owner");
      const { uid } = await createAdminAccount({
        email: ownerEmail,
        displayName: "テストテスト 色確認",
        organizationId: org.organizationId,
        role: "owner",
        actorKind: "system",
      });
      await adminAuth().updateUser(uid, { password: args[0] ?? "" });
      const subject = await submitAnswers(org.organizationId, 1, uniformAnswers(1));
      await submitAnswers(org.organizationId, 2, uniformAnswers(3));
      await db
        .collection(COLLECTIONS.results)
        .doc(subject.resultId)
        .update({ reliability: 90, "risks.misconduct": 90 });
      return { ownerEmail, resultId: subject.resultId };
    }
    case "add-reexam": {
      // 再受験（11-2 §5 の前置き: つながりは再受験リンクの prev で登録して作る）。前回の候補を付けて登録し、送信のときに前回と
      // つながる（11-7 §3.4）。再受験は既存スタッフ扱い（Q-33）。番号を前回と同じにすると氏名・電話番号も同じになる。直接は書かない
      const [organizationId = "", previousResultId = "", index = "1"] = args;
      const n = Number(index);
      const registered = await registerAndSave(
        organizationId,
        n,
        "executive",
        randomAnswers(700 + n),
        4,
        previousResultId,
      );
      const { resultId } = await submitSession({ sessionId: registered.sessionId, meta });
      return { resultId, respondentId: registered.respondentId };
    }
    case "backdate-result": {
      // 受験日を過去にする（M7-list-37 の「受験から1年以上」。API では受験日を変えられない）。E2E に限った直接書き込み
      const [resultId = "", days = "400"] = args;
      await db
        .collection(COLLECTIONS.results)
        .doc(resultId)
        .update({ submittedAt: Timestamp.fromMillis(Date.now() - Number(days) * 86_400_000) });
      return { ok: true };
    }
    case "seed-many-rows": {
      // 101 行以上の組織（M7-list-38・46・50）。オーナーと求職者 count 人（テストテスト 101〜）を、seed:local と同じリポジトリの
      // 関数で登録・保存・送信する（直接は書かない。受検者登録のレート制限は service にあり、リポジトリには無い）
      const [password = "", count = "105"] = args;
      const org = await createOrganization({
        name: "E2E 多人数サロン",
        code: null,
        customerNumber: null,
      });
      const { owner } = await createLoginAccounts(org.organizationId, password, ["owner"]);
      const resultIds: string[] = [];
      for (let i = 0; i < Number(count); i += 1) {
        const { resultId } = await submitAnswers(
          org.organizationId,
          101 + i,
          randomAnswers(1000 + i),
        );
        resultIds.push(resultId);
      }
      return { organizationId: org.organizationId, ownerEmail: owner, resultIds };
    }
    case "seed-empty-org": {
      // 受験が 0 件の組織（M7-list-47）。組織・オーナー・管理者（admin）だけ
      const org = await createOrganization({
        name: "E2E 受験なしサロン",
        code: null,
        customerNumber: null,
      });
      const emails = await createLoginAccounts(org.organizationId, args[0] ?? "", [
        "owner",
        "admin",
      ]);
      return {
        organizationId: org.organizationId,
        ownerEmail: emails.owner,
        adminEmail: emails.admin,
      };
    }
    case "submit-type": {
      // 指定の適性タイプになる回答を固定シードの乱数回答から探して送信する（E-12 のコンダクタータイプ例）
      const [organizationId = "", aptitudeType = ""] = args;
      for (let seed = 1; seed <= 20_000; seed += 1) {
        const answers = randomAnswers(seed);
        if (scoreAnswers(answers).aptitudeType !== aptitudeType) continue;
        return { ...(await submitAnswers(organizationId, 50, answers)), seed };
      }
      throw new Error(`${aptitudeType} になる回答が見つかりませんでした`);
    }
    case "admin-user-doc": {
      const snap = await db
        .collection(COLLECTIONS.adminUsers)
        .doc(args[0] ?? "")
        .get();
      const updatedAt = snap.get("updatedAt") as Timestamp;
      return { displayName: snap.get("displayName") as string, updatedAt: updatedAt.toMillis() };
    }
    case "user-claims": {
      const user = await adminAuth().getUserByEmail(args[0] ?? "");
      return { uid: user.uid, claims: user.customClaims ?? null };
    }
    default:
      throw new Error(`未知のタスクです: ${task}`);
  }
}

const [task, ...args] = process.argv.slice(2);
run(task, args).then(
  (result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exit(0);
  },
  (error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exit(1);
  },
);

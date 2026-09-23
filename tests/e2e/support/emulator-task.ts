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
  const registered = await registerAndSave(organizationId, index, "applicant", answers, 20);
  const { resultId } = await submitSession({ sessionId: registered.sessionId, meta });
  return { resultId, respondentId: registered.respondentId };
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

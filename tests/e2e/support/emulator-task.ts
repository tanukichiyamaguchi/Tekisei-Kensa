// E2E から Admin SDK（Emulator）を使う処理。Playwright のローダーは firebase-admin を読み込めないため、
// tsx の子プロセスで実行し、結果を JSON で標準出力に返す（support/admin.ts から呼ぶ）
import { Timestamp } from "firebase-admin/firestore";

import { COLLECTIONS } from "@/lib/db/collections";
import { createOrganization } from "@/lib/db/repositories/organizations-repository";
import { adminFirestore } from "@/lib/firebase/admin";

async function run(task: string | undefined, args: string[]): Promise<unknown> {
  const db = adminFirestore();
  switch (task) {
    case "create-organizations": {
      const main = await createOrganization({
        name: "E2E 歯科医院",
        code: null,
        customerNumber: null,
      });
      const other = await createOrganization({
        name: "E2E 別医院",
        code: null,
        customerNumber: null,
      });
      return { organizationId: main.organizationId, otherOrganizationId: other.organizationId };
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

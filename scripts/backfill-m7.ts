// M7 で足した項目の補い（11-2 §3.1、11-1 §3.6、11-6 §3.1、11-7 §3.1、11-8 §3.5）。pnpm m7:backfill
//
//   pnpm m7:backfill --dry-run   （書き込まずに、手順ごとに書く件数だけを出す）
//   pnpm m7:backfill
//
// 項目の無い文書（M7 より前に作られた文書）に、その項目の作成時の値を書く。論理削除済みの文書も対象にする。
// 項目がある文書は触らないため、何度実行しても結果が同じで、2 回目は 0 件になる。
// 出力は手順ごとの件数だけ（文書 ID・氏名・電話番号・メールアドレス・招待トークンを出さない。10 K-17）。
// respondents・assessmentSessions・usageLogs は変えず（11-1 §3.6）、aiAnalyses は読み取りで補う（11-6 §3.2）。
// organizations の招待トークンの手順（11-8 §3.5）はまだ入れていない（11 総論 8.3 の 9）。
// 公開の順はインデックス → コード → 本スクリプト（08 §8.2）。本番は GitHub Actions の firebase-ops
// （task = backfill-m7）から実行する（10 K-12）。firebase-ops の入力 dry_run の既定は --dry-run を付けた試しで、
// 書くのは dry_run を外したときだけ。実装者は Emulator に対してのみ実行する（01）。
import { parseArgs } from "node:util";

import { FieldPath, FieldValue } from "firebase-admin/firestore";
import type { DocumentData, Query, QueryDocumentSnapshot } from "firebase-admin/firestore";

import { COLLECTIONS, rawCollection, type CollectionName } from "../lib/db/collections";
import { initialEmploymentStatus } from "../lib/db/employment-status";
import type { RespondentKind } from "../lib/db/types";
import { adminFirestore } from "../lib/firebase/admin";
import { firebaseAdminEnv } from "../lib/utils/env";
import { isEntryPoint, runMain } from "./lib/cli";
import { loadDotEnvLocal } from "./lib/load-env";

export interface BackfillM7Options {
  readonly dryRun: boolean;
  /** 1 ページで読む文書の数。そのページの書き込みを 1 つのバッチにする（既定 400。テストでは小さくしてよい） */
  readonly pageSize?: number;
}

/** 手順ごとの件数（--dry-run では、書いたときと同じ件数） */
export interface BackfillM7Counts {
  /** results の区分・入社日・退職日・役職（11-2 §3.1） */
  readonly resultsEmployment: number;
  /** results の前回の結果 previousResultId（11-7 §3.1） */
  readonly resultsPreviousResult: number;
  /** results の AI の 3 系統（11-6 §3.1） */
  readonly resultsAi: number;
  /** 書いた results の文書（1 文書に 1 回の書き込みにまとめる） */
  readonly resultsWritten: number;
  /** adminUsers のお知らせの既読（11-8 §3.5） */
  readonly adminUsersAnnouncements: number;
}

const DEFAULT_PAGE_SIZE = 400;
const MAX_PAGE_SIZE = 400; // 1 バッチ 500 書き込みの上限に余裕を残す

/** 育成・定着と経年比較の AI 解説の作成時の値（11-6 §3.1。submitSession() と同じ値） */
const RESULT_AI_INITIAL_FIELDS = {
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

/**
 * コレクションを文書 ID の順に pageSize 件ずつ読み、ページごとに visit を呼ぶ。
 * 項目の有無を見るため、select() で絞らずに文書を丸ごと読む（空の map・null の項目の射影に頼らない。
 * 読み取りの回数は絞っても同じ）。
 * 呼び出し側は 1 ページの書き込みを 1 つのバッチにするので、1 文書に 1 書き込みの手順にだけ使う
 * （1 文書に 2 書き込みの手順（11-8 §3.5 の招待トークンの作り直しと監査ログ）では、1 ページを
 * MAX_PAGE_SIZE の半分以下にする）
 */
async function forEachPage(
  collection: CollectionName,
  pageSize: number,
  visit: (docs: readonly QueryDocumentSnapshot[]) => Promise<void>,
): Promise<void> {
  let last: QueryDocumentSnapshot | null = null;
  for (;;) {
    let query: Query = rawCollection(collection).orderBy(FieldPath.documentId()).limit(pageSize);
    if (last !== null) query = query.startAfter(last);
    const snapshot = await query.get();
    await visit(snapshot.docs);
    if (snapshot.size < pageSize) return;
    last = snapshot.docs[snapshot.docs.length - 1]!;
  }
}

/** results の 1 文書に足す項目（無い項目だけ。作成時の値） */
function resultPatch(data: DocumentData): {
  readonly employment: boolean;
  readonly previousResult: boolean;
  readonly ai: boolean;
  readonly fields: Record<string, unknown>;
} {
  // employmentStatus がある文書は、ほかの 3 つが無くても触らない（11-2 §3.1）
  const employment = data.employmentStatus === undefined;
  const previousResult = data.previousResultId === undefined;
  const ai = data.trainingAiStatus === undefined;
  const fields: Record<string, unknown> = {};
  if (employment) {
    Object.assign(fields, {
      employmentStatus: initialEmploymentStatus(data.respondentKind as RespondentKind), // K-28
      hiredOn: null,
      leftOn: null,
      staffRole: null,
    });
  }
  if (previousResult) fields.previousResultId = null; // M7 より前の受験にはつながりが無い
  if (ai) Object.assign(fields, RESULT_AI_INITIAL_FIELDS); // 採用向けの 4 項目には触らない
  return { employment, previousResult, ai, fields };
}

/** M7 の項目の補い。処理関数（結合テストから import する。02 §13.2） */
export async function backfillM7(
  options: BackfillM7Options,
  deps: { readonly print: (line: string) => void },
): Promise<BackfillM7Counts> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new RangeError(`pageSize は 1〜${MAX_PAGE_SIZE} です`);
  }
  const counts = {
    resultsEmployment: 0,
    resultsPreviousResult: 0,
    resultsAi: 0,
    resultsWritten: 0,
    adminUsersAnnouncements: 0,
  };

  // results: 区分・入社日・退職日・役職、previousResultId、AI の 3 系統（論理削除済みを含む）
  await forEachPage(COLLECTIONS.results, pageSize, async (docs) => {
    const batch = adminFirestore().batch();
    let writes = 0;
    for (const doc of docs) {
      const patch = resultPatch(doc.data());
      if (patch.employment) counts.resultsEmployment += 1;
      if (patch.previousResult) counts.resultsPreviousResult += 1;
      if (patch.ai) counts.resultsAi += 1;
      if (Object.keys(patch.fields).length === 0) continue;
      counts.resultsWritten += 1;
      batch.update(doc.ref, { ...patch.fields, updatedAt: FieldValue.serverTimestamp() });
      writes += 1;
    }
    if (!options.dryRun && writes > 0) await batch.commit();
  });

  // adminUsers: お知らせの既読の空の map（論理削除済みを含む）
  await forEachPage(COLLECTIONS.adminUsers, pageSize, async (docs) => {
    const batch = adminFirestore().batch();
    let writes = 0;
    for (const doc of docs) {
      if (doc.data().dismissedAnnouncements !== undefined) continue; // 既読のキーを持つ文書は触らない
      counts.adminUsersAnnouncements += 1;
      batch.update(doc.ref, {
        dismissedAnnouncements: {},
        updatedAt: FieldValue.serverTimestamp(),
      });
      writes += 1;
    }
    if (!options.dryRun && writes > 0) await batch.commit();
  });

  const verb = options.dryRun ? "書く予定の" : "書いた";
  if (options.dryRun) deps.print("--dry-run: 書き込まずに件数だけを出します");
  deps.print(`results の区分・入社日・退職日・役職: ${counts.resultsEmployment} 件`);
  deps.print(`results の前回の結果（previousResultId）: ${counts.resultsPreviousResult} 件`);
  deps.print(`results の AI の 3 系統: ${counts.resultsAi} 件`);
  deps.print(`adminUsers のお知らせの既読: ${counts.adminUsersAnnouncements} 件`);
  deps.print(
    `${verb}文書: results ${counts.resultsWritten} 件、adminUsers ${counts.adminUsersAnnouncements} 件`,
  );
  return counts;
}

async function main(): Promise<void> {
  loadDotEnvLocal();
  const { values } = parseArgs({ options: { "dry-run": { type: "boolean" } }, strict: true });
  const env = firebaseAdminEnv();
  console.log(
    `接続先: ${env.FIRESTORE_EMULATOR_HOST ? "Firebase Emulator" : "Firebase プロジェクト"} ${env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}`,
  );
  await backfillM7({ dryRun: values["dry-run"] === true }, { print: (line) => console.log(line) });
}

if (isEntryPoint(import.meta.url)) void runMain(main);

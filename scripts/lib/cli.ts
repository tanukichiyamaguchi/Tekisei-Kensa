// 運用スクリプトの共通処理: エントリポイント判定と、失敗時のメッセージ表示（スタックトレースや秘密値を出さない）
import { pathToFileURL } from "node:url";

import { firebaseErrorCode } from "../../lib/services/firebase-errors";

export function isEntryPoint(importMetaUrl: string): boolean {
  return process.argv[1] !== undefined && importMetaUrl === pathToFileURL(process.argv[1]).href;
}

/** 利用者の入力誤り（使い方の誤り）。メッセージだけを表示して終了コード 2 */
export class UsageError extends Error {
  override readonly name = "UsageError";
}

export async function runMain(main: () => Promise<void>): Promise<void> {
  try {
    await main();
    process.exit(typeof process.exitCode === "number" ? process.exitCode : 0);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(error.message);
      process.exit(2);
    }
    const code = firebaseErrorCode(error);
    console.error(`失敗しました${code ? `（${code}）` : ""}: ${(error as Error).message}`);
    process.exit(1);
  }
}

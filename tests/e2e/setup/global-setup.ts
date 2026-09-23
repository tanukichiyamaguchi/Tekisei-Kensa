// E2E の前準備（08 §3.4.1）。受検リンク用の組織を作り、ID を tests/e2e/.state.json（git 管理外）に書く。
// seed:local のデータは消さない（各シナリオが作る受検者は名前で区別する。08 §3.4.2）
import { writeFileSync } from "node:fs";

import { emulatorTask } from "../support/admin";
import { STATE_FILE, type E2eState } from "../support/state";

export default function globalSetup(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "E2E は Firebase Emulator の中で実行してください（pnpm firebase emulators:exec ...）",
    );
  }
  const state = emulatorTask<E2eState>("create-organizations");
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

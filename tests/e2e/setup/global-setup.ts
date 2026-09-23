// E2E の前準備（08 §3.4.1）。Emulator の中で実行されていることだけを確かめる。
// 組織はテストごとに作る（support/fixtures.ts）。seed:local のデータは消さない（08 §3.4.2）
export default function globalSetup(): void {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      "E2E は Firebase Emulator の中で実行してください（pnpm firebase emulators:exec ...）",
    );
  }
}

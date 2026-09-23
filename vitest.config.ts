// 08 §3.1.2 の設定。unit は Firebase 不要、integration は Firebase Emulator Suite（Auth 9099、Firestore 8080）が必要。
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** 結合テストの環境変数（Emulator 専用のダミー値。実プロジェクトには接続しない。08 §3.3.1） */
const integrationEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-tekisei",
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
  NEXT_PUBLIC_APP_BASE_URL: "http://localhost:3000",
  AI_PROVIDER: "stub",
  AI_MODEL: "claude-opus-5",
  AI_PROMPT_VERSION: "recruitment-v1",
  PDF_TOKEN_SECRET: "dummy-pdf-token-secret-do-not-ship-0123456789",
  // google-auth-library が GCE メタデータサーバを探しに行かないようにする（Emulator では認証情報を使わない）
  METADATA_SERVER_DETECTION: "none",
};

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          env: integrationEnv,
          globalSetup: ["tests/integration/setup/global-setup.ts"],
          setupFiles: ["tests/integration/setup/per-file.ts"],
          // 同じ Emulator を使い、ファイルごとにデータをクリアするため直列（08 §3.1.2）
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts"],
      thresholds: {
        "lib/scoring/**": { lines: 100, branches: 95 },
        "lib/masters/**": { lines: 95 },
      },
    },
  },
});

// 08 §3.1.2 の設定。結合テスト（integration プロジェクト）は M2 で Firebase Emulator とともに追加する。
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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

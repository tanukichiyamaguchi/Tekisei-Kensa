// E2E（08 §3.4.1）。Emulator の中で `pnpm build` 済みのアプリ（next start）に対して実行する（D08-28）。
//   pnpm build && pnpm firebase emulators:exec --only auth,firestore --project demo-tekisei "pnpm seed:local && pnpm test:e2e"
// ローカルで別の Chromium を使う場合は PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH を指定する
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const launchOptions = executablePath ? { executablePath } : {};

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1, // 同じ Emulator を使うため直列
  retries: process.env.CI ? 1 : 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    launchOptions,
  },
  globalSetup: "./tests/e2e/setup/global-setup.ts",
  projects: [
    {
      // モバイル（決定事項 6）。CI は Chromium だけを入れるため、iPhone 13 の画面寸法・タッチを Chromium で再現する
      name: "respondent-mobile",
      testMatch: /respondent\/.*\.spec\.ts/,
      use: { ...devices["iPhone 13"], browserName: "chromium", launchOptions },
    },
    {
      name: "respondent-desktop",
      testMatch: /respondent\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        launchOptions,
      },
    },
    {
      // 管理画面は PC 幅 1440×900 のみ（06 D06-02、08 §3.4.1）
      name: "admin-desktop",
      testMatch: /admin\/.*\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        launchOptions,
      },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

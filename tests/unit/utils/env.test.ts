// U-08 lib/utils/env.ts（01 §4.3、00 §3.2）
import { describe, expect, it } from "vitest";

import {
  appBaseUrl,
  EnvError,
  isLocalHttp,
  parseServiceAccount,
  validateFirebaseAdminEnv,
  validateServerEnv,
} from "@/lib/utils/env";

const serviceAccount = (projectId: string) =>
  Buffer.from(
    JSON.stringify({
      project_id: projectId,
      client_email: "sa@example.iam.gserviceaccount.com",
      private_key: "dummy",
    }),
  ).toString("base64");

/** Emulator を使うローカル開発の最小構成 */
const LOCAL = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-tekisei",
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  AI_PROVIDER: "stub",
  AI_MODEL: "claude-opus-5",
  AI_PROMPT_VERSION: "recruitment-v1",
  PDF_TOKEN_SECRET: "x".repeat(32),
} as const;

/** Vercel 本番の最小構成（Emulator なし・サービスアカウントあり） */
const PRODUCTION = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "tekisei.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "tekisei",
  NEXT_PUBLIC_FIREBASE_APP_ID: "app",
  FIREBASE_SERVICE_ACCOUNT_KEY: serviceAccount("tekisei"),
  NEXT_PUBLIC_APP_BASE_URL: "https://example.com",
  AI_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: "sk-test",
  AI_MODEL: "claude-opus-5",
  AI_PROMPT_VERSION: "recruitment-v1",
  PDF_TOKEN_SECRET: "y".repeat(32),
  VERCEL: "1",
  VERCEL_ENV: "production",
} as const;

const fails = (source: Record<string, string | undefined>, message?: RegExp) => {
  expect(() => validateServerEnv(source)).toThrow(EnvError);
  if (message) expect(() => validateServerEnv(source)).toThrow(message);
};

describe("U-08 validateServerEnv", () => {
  it("ローカル（Emulator）と本番の最小構成を受理する", () => {
    expect(validateServerEnv(LOCAL).SESSION_COOKIE_NAME).toBe("admin_session");
    expect(validateServerEnv(PRODUCTION).AI_PROVIDER).toBe("anthropic");
    expect(validateServerEnv({ ...LOCAL, SESSION_COOKIE_NAME: "" }).SESSION_COOKIE_NAME).toBe(
      "admin_session",
    );
  });

  it.each([
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
    "AI_MODEL",
    "AI_PROMPT_VERSION",
    "PDF_TOKEN_SECRET",
  ])("必須変数 %s の欠落で失敗", (key) => {
    fails({ ...LOCAL, [key]: undefined });
  });

  it("サービスアカウントも Emulator の 2 変数も無ければ失敗", () => {
    fails(
      { ...LOCAL, FIRESTORE_EMULATOR_HOST: undefined, FIREBASE_AUTH_EMULATOR_HOST: undefined },
      /FIREBASE_SERVICE_ACCOUNT_KEY/,
    );
  });
  it("Emulator の 2 変数の片方だけは失敗", () => {
    fails({ ...LOCAL, FIREBASE_AUTH_EMULATOR_HOST: undefined }, /両方/);
  });
  it("サービスアカウントが Base64 の JSON でない・項目不足・project_id 不一致で失敗", () => {
    fails({ ...PRODUCTION, FIREBASE_SERVICE_ACCOUNT_KEY: "not-base64-json" }, /JSON/);
    fails(
      {
        ...PRODUCTION,
        FIREBASE_SERVICE_ACCOUNT_KEY: Buffer.from(
          JSON.stringify({ project_id: "tekisei" }),
        ).toString("base64"),
      },
      /private_key/,
    );
    fails({ ...PRODUCTION, FIREBASE_SERVICE_ACCOUNT_KEY: serviceAccount("other") }, /一致しません/);
  });
  it.each([
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
  ])("本番・プレビューで Emulator 用の %s があれば失敗", (key) => {
    for (const VERCEL_ENV of ["production", "preview"]) {
      const source: Record<string, string | undefined> = {
        ...PRODUCTION,
        VERCEL_ENV,
        VERCEL: undefined,
        [key]: "127.0.0.1:9099",
      };
      if (key !== "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST") {
        source.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
        source.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
      }
      fails(source);
    }
  });
  it("Vercel 上で Emulator の変数があれば失敗", () => {
    fails({ ...LOCAL, VERCEL: "1" }, /Vercel/);
  });
  it("AI_PROVIDER=anthropic で ANTHROPIC_API_KEY が無ければ失敗（既定は anthropic）", () => {
    fails({ ...PRODUCTION, ANTHROPIC_API_KEY: undefined }, /ANTHROPIC_API_KEY/);
    fails({ ...LOCAL, AI_PROVIDER: undefined }, /ANTHROPIC_API_KEY/);
  });
  it("本番で AI_PROVIDER=stub、NEXT_PUBLIC_APP_BASE_URL 未設定は失敗（NODE_ENV は使わない）", () => {
    fails({ ...PRODUCTION, AI_PROVIDER: "stub" }, /stub/);
    fails({ ...PRODUCTION, NEXT_PUBLIC_APP_BASE_URL: undefined }, /NEXT_PUBLIC_APP_BASE_URL/);
    fails({ ...PRODUCTION, NEXT_PUBLIC_APP_BASE_URL: "" }, /NEXT_PUBLIC_APP_BASE_URL/);
    expect(() =>
      validateServerEnv({ ...PRODUCTION, VERCEL_ENV: "preview", AI_PROVIDER: "stub" }),
    ).not.toThrow();
  });
  it("AI_PROMPT_VERSION が登録外、PDF_TOKEN_SECRET が 32 文字未満、Vercel で PDF_CHROMIUM_EXECUTABLE_PATH は失敗", () => {
    fails({ ...LOCAL, AI_PROMPT_VERSION: "recruitment-v9" }, /AI_PROMPT_VERSION/);
    fails({ ...LOCAL, PDF_TOKEN_SECRET: "short" });
    fails(
      { ...PRODUCTION, PDF_CHROMIUM_EXECUTABLE_PATH: "/usr/bin/chromium" },
      /PDF_CHROMIUM_EXECUTABLE_PATH/,
    );
  });
  it("エラーメッセージに値を含めない", () => {
    try {
      validateServerEnv({ ...PRODUCTION, FIREBASE_SERVICE_ACCOUNT_KEY: serviceAccount("other") });
    } catch (e) {
      expect((e as Error).message).not.toContain("sa@example");
      expect((e as Error).message).not.toContain("dummy");
    }
  });
});

describe("validateFirebaseAdminEnv（スクリプト・Admin SDK 用の狭い検証）", () => {
  it("AI_MODEL 等が無くても通る", () => {
    expect(() =>
      validateFirebaseAdminEnv({
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-tekisei",
        FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      }),
    ).not.toThrow();
  });
  it("parseServiceAccount は JSON をそのまま貼り付けた値（前後の空白・改行を含む）も受け付ける", () => {
    const raw = `\n  ${Buffer.from(serviceAccount("p"), "base64").toString("utf8")}\n`;
    expect(parseServiceAccount(raw).project_id).toBe("p");
    expect(() => parseServiceAccount("{ not json")).toThrow(EnvError);
  });
  it("parseServiceAccount は 3 項目を返す", () => {
    expect(parseServiceAccount(serviceAccount("p"))).toEqual({
      project_id: "p",
      client_email: "sa@example.iam.gserviceaccount.com",
      private_key: "dummy",
    });
  });
});

describe("appBaseUrl の優先順", () => {
  it("NEXT_PUBLIC_APP_BASE_URL（末尾 / 除去）→ https://VERCEL_URL → http://localhost:3000", () => {
    expect(
      appBaseUrl({
        NEXT_PUBLIC_APP_BASE_URL: "https://a.example.com//",
        VERCEL_URL: "b.vercel.app",
      }),
    ).toBe("https://a.example.com");
    expect(appBaseUrl({ NEXT_PUBLIC_APP_BASE_URL: undefined, VERCEL_URL: "b.vercel.app" })).toBe(
      "https://b.vercel.app",
    );
    expect(appBaseUrl({ NEXT_PUBLIC_APP_BASE_URL: undefined, VERCEL_URL: undefined })).toBe(
      "http://localhost:3000",
    );
    expect(isLocalHttp(validateServerEnv(LOCAL))).toBe(true);
    expect(isLocalHttp(validateServerEnv(PRODUCTION))).toBe(false);
  });
});

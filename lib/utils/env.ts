// 環境変数の唯一の読み出し口（01 §4.3）。process.env を直接読むのはこのファイルだけ（例外は scripts/ と proxy.ts）。
import { z } from "zod";

import { isKnownPromptVersion } from "@/lib/ai/prompts";

const hostPattern = /^[A-Za-z0-9.-]+:\d+$/; // 例 127.0.0.1:8080

/** 空文字は未設定として扱う（.env.example の「KEY=」をそのまま使えるように） */
const optionalString = <T extends z.ZodType<string>>(schema: T) =>
  z.preprocess((v) => (v === "" ? undefined : v), schema.optional());

const firebaseAdminSchema = z.object({
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_SERVICE_ACCOUNT_KEY: optionalString(z.string().min(1)),
  FIREBASE_AUTH_EMULATOR_HOST: optionalString(z.string().regex(hostPattern)),
  FIRESTORE_EMULATOR_HOST: optionalString(z.string().regex(hostPattern)),
  VERCEL: optionalString(z.string()),
});

const serverSchema = firebaseAdminSchema.extend({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: optionalString(z.string().regex(hostPattern)),
  FIREBASE_STORAGE_BUCKET: optionalString(z.string().min(1)),
  SESSION_COOKIE_NAME: z.preprocess(
    (v) => (v === "" || v === undefined ? "admin_session" : v),
    z.string().regex(/^[A-Za-z0-9_-]+$/),
  ),
  NEXT_PUBLIC_APP_BASE_URL: optionalString(z.url()),
  AI_PROVIDER: z.preprocess(
    (v) => (v === "" || v === undefined ? "anthropic" : v),
    z.enum(["anthropic", "stub"]),
  ),
  ANTHROPIC_API_KEY: optionalString(z.string().min(1)),
  AI_MODEL: z.string().min(1),
  AI_PROMPT_VERSION: z.string().min(1),
  // PDF 印刷トークンの HMAC 鍵（04 D04-40）。32 バイト以上の乱数を base64 / hex で表した文字列
  PDF_TOKEN_SECRET: z.string().min(32),
  PDF_CHROMIUM_EXECUTABLE_PATH: optionalString(z.string().min(1)),
  VERCEL_ENV: optionalString(z.enum(["production", "preview", "development"])),
  VERCEL_URL: optionalString(z.string()),
  VERCEL_AUTOMATION_BYPASS_SECRET: optionalString(z.string()),
});

const publicSchema = z.object({
  NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST: optionalString(z.string().regex(hostPattern)),
});

/** サービスアカウント JSON のうち Admin SDK の cert() に必要な 3 項目だけを検証する */
const serviceAccountSchema = z.object({
  project_id: z.string().min(1),
  client_email: z.email(),
  private_key: z.string().min(1),
});

export type FirebaseAdminEnv = z.infer<typeof firebaseAdminSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;
export type ServiceAccount = z.infer<typeof serviceAccountSchema>;

export class EnvError extends Error {
  override readonly name = "EnvError";
}

type EnvSource = Readonly<Record<string, string | undefined>>;

function issuesOf(error: z.ZodError): string {
  return error.issues.map((i) => i.path.join(".")).join(", ");
}

/**
 * サービスアカウント鍵を復号・検証する。Base64 化した JSON（01 §4.6）と、ダウンロードした JSON をそのまま貼り付けた値の
 * 両方を受け付ける（10 K-12: 依頼主はローカルで Base64 化できないため）。値そのものはログ・例外に出さない
 */
export function parseServiceAccount(value: string): ServiceAccount {
  const trimmed = value.trim();
  let json: unknown;
  try {
    json = JSON.parse(
      trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8"),
    );
  } catch {
    throw new EnvError(
      "FIREBASE_SERVICE_ACCOUNT_KEY を JSON（そのまま、または Base64 化したもの）として読めません",
    );
  }
  const parsed = serviceAccountSchema.safeParse(json);
  if (!parsed.success) {
    throw new EnvError(
      "FIREBASE_SERVICE_ACCOUNT_KEY に project_id / client_email / private_key がありません",
    );
  }
  return parsed.data;
}

/**
 * Firebase Admin SDK の初期化に必要な値だけを検証する（lib/firebase/admin.ts と運用スクリプトが使う。01 §4.3 の
 * 「スクリプトは AI_MODEL 等を要求しない」に対応）。Emulator と実プロジェクトの取り違えを検出する。
 */
export function validateFirebaseAdminEnv(source: EnvSource): FirebaseAdminEnv {
  const parsed = firebaseAdminSchema.safeParse(source);
  if (!parsed.success) throw new EnvError(`環境変数が不正です: ${issuesOf(parsed.error)}`);
  const env = parsed.data;
  const onVercel = env.VERCEL === "1";
  const usingEmulator = Boolean(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST);
  if (onVercel && usingEmulator) {
    throw new EnvError(
      "Vercel 上では FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST を設定しないでください",
    );
  }
  if (usingEmulator && !(env.FIRESTORE_EMULATOR_HOST && env.FIREBASE_AUTH_EMULATOR_HOST)) {
    throw new EnvError(
      "Emulator を使う場合は FIRESTORE_EMULATOR_HOST と FIREBASE_AUTH_EMULATOR_HOST の両方を設定してください",
    );
  }
  if (!usingEmulator && !env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    throw new EnvError("Emulator を使わない場合は FIREBASE_SERVICE_ACCOUNT_KEY が必要です");
  }
  if (env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const sa = parseServiceAccount(env.FIREBASE_SERVICE_ACCOUNT_KEY);
    if (sa.project_id !== env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
      throw new EnvError(
        "FIREBASE_SERVICE_ACCOUNT_KEY の project_id が NEXT_PUBLIC_FIREBASE_PROJECT_ID と一致しません",
      );
    }
  }
  return env;
}

/** アプリ全体の起動時検証（01 §4.3）。テストから任意の値で呼べるよう source を受け取る */
export function validateServerEnv(source: EnvSource): ServerEnv {
  validateFirebaseAdminEnv(source);
  const parsed = serverSchema.safeParse(source);
  if (!parsed.success) throw new EnvError(`環境変数が不正です: ${issuesOf(parsed.error)}`);
  const env = parsed.data;
  const onVercel = env.VERCEL === "1";
  if (onVercel && env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST) {
    throw new EnvError(
      "Vercel 上では NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST を設定しないでください",
    );
  }
  if (
    (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") &&
    (env.FIRESTORE_EMULATOR_HOST ||
      env.FIREBASE_AUTH_EMULATOR_HOST ||
      env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST)
  ) {
    throw new EnvError("本番・プレビュー環境では Emulator 用の環境変数を設定しないでください");
  }
  if (env.AI_PROVIDER === "anthropic" && !env.ANTHROPIC_API_KEY) {
    throw new EnvError("AI_PROVIDER=anthropic には ANTHROPIC_API_KEY が必要です");
  }
  if (env.VERCEL_ENV === "production" && env.AI_PROVIDER === "stub") {
    throw new EnvError("本番環境で AI_PROVIDER=stub は使用できません");
  }
  if (env.VERCEL_ENV === "production" && !env.NEXT_PUBLIC_APP_BASE_URL) {
    throw new EnvError("本番環境では NEXT_PUBLIC_APP_BASE_URL を設定してください");
  }
  if (!isKnownPromptVersion(env.AI_PROMPT_VERSION)) {
    throw new EnvError(
      `AI_PROMPT_VERSION=${env.AI_PROMPT_VERSION} は lib/ai/prompts に登録されていません`,
    );
  }
  if (onVercel && env.PDF_CHROMIUM_EXECUTABLE_PATH) {
    throw new EnvError(
      "Vercel 上では PDF_CHROMIUM_EXECUTABLE_PATH を設定しないでください（@sparticuz/chromium を使う）",
    );
  }
  return env;
}

let cachedServer: ServerEnv | null = null;
let cachedFirebase: FirebaseAdminEnv | null = null;

/** サーバ専用。Route Handler、Server Component、lib/services から呼ぶ */
export function serverEnv(): ServerEnv {
  cachedServer ??= validateServerEnv(process.env);
  return cachedServer;
}

/** Firebase Admin SDK の初期化用（lib/firebase/admin.ts、scripts/） */
export function firebaseAdminEnv(): FirebaseAdminEnv {
  cachedFirebase ??= validateFirebaseAdminEnv(process.env);
  return cachedFirebase;
}

/** テスト専用: キャッシュを捨てる（環境変数を差し替えるテストのため） */
export function resetEnvCacheForTest(): void {
  cachedServer = null;
  cachedFirebase = null;
}

/** Emulator に接続しているか */
export function isEmulator(): boolean {
  return Boolean(firebaseAdminEnv().FIRESTORE_EMULATOR_HOST);
}

/** Vercel 上で動いているか（07 §9.10。process.env.VERCEL を直接読まない） */
export function isVercel(): boolean {
  return serverEnv().VERCEL === "1";
}

/** ブラウザでも使える値だけ。NEXT_PUBLIC_ の値はビルド時置換のため個別に参照する */
export function publicEnv(): PublicEnv {
  return publicSchema.parse({
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || undefined,
  });
}

/** 受検リンク・招待リンクの基底 URL（サーバ専用。01 §4.2） */
export function appBaseUrl(
  env: Pick<ServerEnv, "NEXT_PUBLIC_APP_BASE_URL" | "VERCEL_URL"> = serverEnv(),
): string {
  if (env.NEXT_PUBLIC_APP_BASE_URL) return env.NEXT_PUBLIC_APP_BASE_URL.replace(/\/+$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return "http://localhost:3000";
}

/** Secure 属性を外してよいローカル実行か（http://localhost。01 §5.8） */
export function isLocalHttp(env: ServerEnv = serverEnv()): boolean {
  return appBaseUrl(env).startsWith("http://");
}

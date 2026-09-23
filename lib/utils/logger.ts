// 構造化ログの唯一の出口（01 §8.6）。個人情報をログに出さない。
type Level = "debug" | "info" | "warn" | "error";
export type LogFields = Readonly<Record<string, string | number | boolean | null | undefined>>;

const FORBIDDEN_KEYS = new Set([
  "name",
  "displayName",
  "fullName",
  "phone",
  "phoneNumber",
  "email",
  "password",
  "token",
  "idToken",
  "sessionCookie",
  "cookie",
  "authorization",
  "answers",
  "rawText",
  "rawJson",
  "prompt",
  "apiKey",
  "privateKey",
]);

function sanitize(fields: LogFields): LogFields {
  const out: Record<string, LogFields[string]> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = FORBIDDEN_KEYS.has(k) ? "[redacted]" : v;
  return out;
}

function emit(level: Level, message: string, fields: LogFields = {}): void {
  const line = JSON.stringify({
    level,
    message,
    time: new Date().toISOString(),
    ...sanitize(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (m: string, f?: LogFields) => emit("debug", m, f),
  info: (m: string, f?: LogFields) => emit("info", m, f),
  warn: (m: string, f?: LogFields) => emit("warn", m, f),
  error: (m: string, f?: LogFields) => emit("error", m, f),
};

/** 例外をログ用のフィールドにする。message はメールアドレス等を含み得るため出さず、code と name だけ（01 §8.6） */
export function errorFields(error: unknown): LogFields {
  if (typeof error !== "object" || error === null) return { errorType: typeof error };
  const e = error as { name?: unknown; code?: unknown };
  return {
    errorName: typeof e.name === "string" ? e.name : null,
    errorCode: typeof e.code === "string" || typeof e.code === "number" ? String(e.code) : null,
  };
}

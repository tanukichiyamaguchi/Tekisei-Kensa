// 運用スクリプト用: .env.local を読み、未設定のキーだけ process.env に入れる（既存の環境変数を優先。値は表示しない）
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function readDotEnvLocal(file = path.resolve(".env.local")): Record<string, string> {
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && m[1]) out[m[1]] = (m[2] ?? "").replace(/^["']|["']$/g, "");
  }
  return out;
}

export function loadDotEnvLocal(): void {
  for (const [key, value] of Object.entries(readDotEnvLocal())) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
  // Emulator では認証情報を使わないため、google-auth-library に GCE メタデータサーバを探させない（警告の抑止）
  if (process.env.FIRESTORE_EMULATOR_HOST && process.env.METADATA_SERVER_DETECTION === undefined) {
    process.env.METADATA_SERVER_DETECTION = "none";
  }
}

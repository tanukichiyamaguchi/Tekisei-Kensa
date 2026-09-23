// 必須環境変数の確認（01 §4.3）。pnpm check-env。値そのものは表示しない。
import { validateServerEnv } from "../lib/utils/env";
import { readDotEnvLocal } from "./lib/load-env";

const source = { ...readDotEnvLocal(), ...process.env };
try {
  validateServerEnv(source);
  console.log("環境変数は正しく設定されています。");
} catch (error) {
  console.error((error as Error).message);
  if (!source.PDF_TOKEN_SECRET) {
    console.error("PDF_TOKEN_SECRET は `openssl rand -base64 32` で生成して設定してください。");
  }
  const emulatorVars = [
    "FIRESTORE_EMULATOR_HOST",
    "FIREBASE_AUTH_EMULATOR_HOST",
    "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST",
  ];
  if (emulatorVars.some((k) => source[k]) && !emulatorVars.every((k) => source[k])) {
    console.error(`Emulator を使う場合は ${emulatorVars.join("、")} をすべて設定してください。`);
  }
  process.exit(1);
}

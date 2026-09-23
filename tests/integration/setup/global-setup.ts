// Emulator が起動済みであることを確認する（08 §3.3.2）
export default async function globalSetup(): Promise<void> {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
  for (const [label, url] of [
    ["Firestore", `http://${host}/`],
    ["Auth", `http://${authHost}/`],
  ] as const) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(3000) });
    } catch {
      throw new Error(
        `${label} Emulator（${url}）に接続できません。\`pnpm emulators\` を先に起動するか、\`pnpm test:integration:emu\` を使ってください。`,
      );
    }
  }
}

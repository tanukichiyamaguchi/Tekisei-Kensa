// Emulator 上のデータを Admin SDK で読み書きする（support/emulator-task.ts を tsx の子プロセスで実行する）
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TASK = fileURLToPath(new URL("./emulator-task.ts", import.meta.url));
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export function emulatorTask<T>(task: string, ...args: string[]): T {
  const out = execFileSync("pnpm", ["-s", "tsx", TASK, task, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, METADATA_SERVER_DETECTION: "none" },
  });
  const line = out.trim().split("\n").at(-1) ?? "";
  return JSON.parse(line) as T;
}

// テストファイルごとに Emulator のデータを空にする（08 §3.3.1）
import { beforeAll } from "vitest";

import { clearEmulators } from "../helpers/emulator";

beforeAll(async () => {
  await clearEmulators();
});

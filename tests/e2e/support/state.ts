// globalSetup が書く E2E の前提データ（tests/e2e/.state.json）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const STATE_FILE = fileURLToPath(new URL("../.state.json", import.meta.url));

export interface E2eState {
  readonly organizationId: string;
  readonly otherOrganizationId: string;
}

export function readState(): E2eState {
  return JSON.parse(readFileSync(STATE_FILE, "utf8")) as E2eState;
}

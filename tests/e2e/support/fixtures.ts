// E2E のテストごとの前提データ。受検者登録のレート制限（同一組織・同一 IP で 10 分 20 件。04 §2.8）に
// テスト同士が影響しないよう、組織はテストごとに作る（E2E ではすべての登録が同じ IP から来るため）
import { test as base } from "@playwright/test";

import { emulatorTask } from "./admin";

export function createOrganization(name = "E2E 歯科医院"): string {
  return emulatorTask<{ organizationId: string }>("create-organization", name).organizationId;
}

export const test = base.extend<{ organizationId: string }>({
  // Playwright の fixture は第 1 引数の分割代入を要求する
  // eslint-disable-next-line no-empty-pattern
  organizationId: async ({}, use) => {
    await use(createOrganization());
  },
});

export { expect } from "@playwright/test";

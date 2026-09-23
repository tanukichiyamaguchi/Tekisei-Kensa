// I-01 セキュリティルールが全拒否であること（00 §2.1、D-28）。@firebase/rules-unit-testing 5.x（09 §6.4 の 40）
// クライアント SDK（firebase/firestore）を使う唯一のテスト。ESLint の第 3 群の例外として許可している
import { readFileSync } from "node:fs";

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { writeDocForTest } from "../helpers/firestore";

const RULES_PATH = "firebase/firestore.rules";
const STORAGE_RULES_PATH = "firebase/storage.rules";

let env: RulesTestEnvironment;

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-tekisei",
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: host!, port: Number(port) },
  });
  // Admin SDK（ルール対象外）で既存文書を用意する
  for (const name of ["results", "respondents", "organizations"]) {
    await writeDocForTest(name, "existing", { organizationId: "org1", deletedAt: null });
  }
});

afterAll(async () => {
  await env.cleanup();
});

describe("I-01 Firestore ルールは全拒否", () => {
  const contexts = [
    ["認証なし", () => env.unauthenticatedContext().firestore()],
    [
      "任意の uid で認証済み（管理者と同じクレーム付き）",
      () =>
        env.authenticatedContext("someone", { organizationId: "org1", role: "owner" }).firestore(),
    ],
  ] as const;

  for (const [label, firestore] of contexts) {
    describe(label, () => {
      for (const name of ["results", "respondents", "organizations"]) {
        it(`${name}: get / list / set が拒否される`, async () => {
          const db = firestore();
          await assertFails(getDoc(doc(db, name, "existing")));
          await assertFails(getDoc(doc(db, name, "missing")));
          await assertFails(getDocs(collection(db, name)));
          await assertFails(setDoc(doc(db, name, "new"), { organizationId: "org1" }));
          await assertFails(
            setDoc(doc(db, name, "existing"), { organizationId: "org2" }, { merge: true }),
          );
        });
      }
    });
  }
});

describe("I-01 storage.rules（Storage Emulator は起動しないため内容を文字列で確認）", () => {
  it("allow read, write: if false; のみ", () => {
    const body = readFileSync(STORAGE_RULES_PATH, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    const allows = body.match(/allow[^;]*;/g) ?? [];
    expect(allows).toEqual(["allow read, write: if false;"]);
  });

  it("firestore.rules も allow は全拒否の 1 行のみ", () => {
    const body = readFileSync(RULES_PATH, "utf8")
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(body.match(/allow[^;]*;/g) ?? []).toEqual(["allow read, write: if false;"]);
  });
});

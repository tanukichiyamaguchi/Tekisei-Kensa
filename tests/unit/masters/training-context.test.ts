// M7-ai-05 育成・定着の 8 項目のマスタと検証（11-6 §2.5.3・§3.7.4・§5.1）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { trainingContextSchema } from "@/lib/db/schemas/training-context";
import {
  TRAINING_CONTEXT_ITEMS,
  TRAINING_CONTEXT_KEYS,
  trainingContextLabel,
  type TrainingContext,
} from "@/lib/masters/training-context";

const SPEC_AI = readFileSync(
  fileURLToPath(new URL("../../../docs/基本設計/11_参照元の更新/11-6_AI解説.md", import.meta.url)),
  "utf8",
);

/** start の位置から end の手前まで（仕様書の節を切り出す） */
function between(text: string, start: string, end: string): string {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`見つからない: ${start}`);
  return text.slice(from, to);
}

/** 11-6 §2.5.3 の表（行・列・ラベル・コード・選択肢）を、マスタとは別の簡易な読み方で読む */
function specTable() {
  const section = between(SPEC_AI, "#### 2.5.3 ", "#### 2.5.4 ");
  const rows = [
    ...section.matchAll(/^\| (\d) \| (\d) \| ([^|]+) \| `([A-Za-z]+)` \| (.+) \|$/gm),
  ].map((m) => ({
    row: Number(m[1]),
    column: Number(m[2]),
    label: m[3]!.trim(),
    key: m[4]!,
    options: [...m[5]!.matchAll(/`([a-z0-9_]+)`「([^」]+)」/g)].map((o) => ({
      code: o[1]!,
      label: o[2]!,
    })),
  }));
  return rows.sort((a, b) => a.row - b.row || a.column - b.column);
}

const VALID: TrainingContext = {
  tenure: "year_2",
  evaluation: "meets",
  expectedRole: "trainer",
  recentState: "low_energy",
  relationship: "specific_mismatch",
  wish: "skill_up",
  changeSinceJoining: "unchanged",
  concern: "few_reports",
};

describe("M7-ai-05 8 項目のマスタ（lib/masters/training-context.ts）", () => {
  it("8 項目の並び・ラベル・コード・表示名が 11-6 §2.5.3 の表と一致する", () => {
    const table = specTable();
    expect(table).toHaveLength(8);
    expect([...TRAINING_CONTEXT_KEYS]).toEqual(table.map((r) => r.key));
    expect(Object.keys(TRAINING_CONTEXT_ITEMS)).toEqual([...TRAINING_CONTEXT_KEYS]);
    for (const r of table) {
      const item = TRAINING_CONTEXT_ITEMS[r.key as keyof typeof TRAINING_CONTEXT_ITEMS];
      expect(item.label, r.key).toBe(r.label);
      expect(item.options, r.key).toEqual(r.options);
    }
  });

  it("勤続年数の「3年~5年」の「~」は半角。どの項目もコードが重ならない", () => {
    expect(trainingContextLabel("tenure", "years_3_5")).toBe("3年~5年");
    for (const key of TRAINING_CONTEXT_KEYS) {
      const codes = TRAINING_CONTEXT_ITEMS[key].options.map((o) => o.code);
      expect(new Set(codes).size, key).toBe(codes.length);
    }
  });

  it("trainingContextLabel はコードの表示名を返し、未知のコードは RangeError", () => {
    expect(trainingContextLabel("evaluation", "growing")).toBe("もう少し伸びてほしい");
    expect(trainingContextLabel("expectedRole", "stock_equipment")).toBe("在庫・機材管理担当");
    expect(trainingContextLabel("changeSinceJoining", "less_proactive")).toBe(
      "以前より消極的になった",
    );
    expect(trainingContextLabel("concern", "none")).toBe("特にない");
    expect(() => trainingContextLabel("tenure", "years_1")).toThrow(RangeError);
    // 別の項目のコードは使えない（evaluation の growing は changeSinceJoining にもあるが、wish には無い）
    expect(() => trainingContextLabel("wish", "growing")).toThrow(RangeError);
  });
});

describe("M7-ai-05 trainingContextSchema（lib/db/schemas/training-context.ts）", () => {
  it("正しい 8 項目を通す（各項目の選択肢のどれでも）", () => {
    expect(trainingContextSchema.parse(VALID)).toEqual(VALID);
    for (const key of TRAINING_CONTEXT_KEYS) {
      for (const o of TRAINING_CONTEXT_ITEMS[key].options) {
        expect(trainingContextSchema.safeParse({ ...VALID, [key]: o.code }).success).toBe(true);
      }
    }
  });

  it.each(TRAINING_CONTEXT_KEYS)("%s が欠けると拒む", (key) => {
    const value = Object.fromEntries(Object.entries(VALID).filter(([k]) => k !== key));
    expect(trainingContextSchema.safeParse(value).success).toBe(false);
  });

  it("余分なキー・範囲外のコード・別の項目のコード・文字でない値・空は拒む", () => {
    for (const bad of [
      { ...VALID, extra: "x" },
      { ...VALID, tenure: "years_1" },
      { ...VALID, wish: "growing" },
      { ...VALID, concern: "" },
      { ...VALID, recentState: 1 },
      { ...VALID, relationship: null },
      {},
      null,
      "year_2",
    ]) {
      expect(trainingContextSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
    }
  });
});

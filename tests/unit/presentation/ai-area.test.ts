// AI 解説の領域の表示の規則（11-6 §3.7.10 の lib/presentation/ai-area.ts）。M7-ai-02（initialAiTab。11-6 §2.2。PR-7.9 の形: 出せる
// タブは責任者の受験で []、ほかは採用向けと育成・定着の 2 つ。責任者の受験で経年比較を選ぶ観点は PR-7.11a で足す）、M7-ai-04（採用向けの
// recruitmentChipTone。§2.4.4 の表を読んで比べる。育成・定着の trainingChipTone は PR-7.10）、panelParts（§2.3.5 の表。4 つの状態 ×
// この画面の要求・読み直しの最中か × 読み直しが 10 分を過ぎたか を、採用向けと育成・定着で）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { AiAnalysisOutputSchema } from "@/lib/ai/schema";
import { AI_GENERATION_STATUSES, type AiGenerationStatus } from "@/lib/ai/types";
import {
  initialAiTab,
  panelParts,
  RECRUITMENT_CHIP_ORDER,
  recruitmentChipTone,
  type AiPanelParts,
  type ChipTone,
  type RecruitmentChipKind,
} from "@/lib/presentation/ai-area";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";
import {
  decodeResultViewState,
  DEFAULT_RESULT_VIEW_STATE,
} from "@/lib/presentation/result-view-state";

const SPEC = readFileSync(
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

/** PR-7.9 の出せるタブ（11-6 §4.4。lib/services/ai-area.ts の visibleTabsOf と同じ。経年比較のタブは PR-7.11a から） */
const TABS_FOR_OTHERS: readonly AiAnalysisKind[] = ["recruitment", "training"];
const TABS_FOR_MANAGER: readonly AiAnalysisKind[] = [];

describe("M7-ai-02 initialAiTab（11-6 §2.2。PR-7.9 の形）", () => {
  it("画面の状態の aiTab が出せるタブならそのタブ（既定 recruitment → 採用向け、training → 育成・定着）", () => {
    expect(initialAiTab(TABS_FOR_OTHERS, "recruitment")).toBe("recruitment");
    expect(initialAiTab(TABS_FOR_OTHERS, "training")).toBe("training");
  });

  it("出せないタブ（経年比較のタブを出さない間の longitudinal）は、出せるタブの先頭（採用向け）", () => {
    expect(initialAiTab(TABS_FOR_OTHERS, "longitudinal")).toBe("recruitment");
  });

  it("出せるタブが無い（責任者の受験）ときは null（領域を描かない）", () => {
    for (const requested of ["recruitment", "training", "longitudinal"] as const) {
      expect(initialAiTab(TABS_FOR_MANAGER, requested), requested).toBeNull();
    }
  });

  it("URL の ai から初めのタブを選ぶ（ai が無ければ採用向け、ai=training は育成・定着、知らない値は採用向け）", () => {
    const tabOf = (query: Record<string, string>) =>
      initialAiTab(TABS_FOR_OTHERS, decodeResultViewState(query).aiTab);
    expect(initialAiTab(TABS_FOR_OTHERS, DEFAULT_RESULT_VIEW_STATE.aiTab)).toBe("recruitment");
    expect(tabOf({})).toBe("recruitment");
    expect(tabOf({ ai: "training" })).toBe("training");
    expect(tabOf({ ai: "longitudinal" })).toBe("recruitment");
    expect(tabOf({ ai: "foo" })).toBe("recruitment");
  });
});

/** §2.4.4 の判定チップの色の表（チップのラベル → 段階ごとの値。mid の列は「それ以外（例）」の例の値） */
function chipTableOfSpec(): Map<RecruitmentChipKind, Map<ChipTone, string[]>> {
  const section = between(SPEC, "#### 2.4.4 ", "### 2.5 ");
  const lines = section.split("\n");
  const header = lines.find((l) => l.startsWith("| チップ |"));
  if (header === undefined) throw new Error("§2.4.4 の表の見出しが無い");
  const tones = header
    .split("|")
    .slice(2, -1)
    .map((c) => c.trim()) as ChipTone[];
  expect(tones).toEqual(["good", "warn", "bad", "mid"]);
  const kindOfLabel = new Map(
    RECRUITMENT_CHIP_ORDER.map((kind) => [AI_TEXTS.recruitmentView.chips[kind], kind]),
  );
  const table = new Map<RecruitmentChipKind, Map<ChipTone, string[]>>();
  for (const line of lines) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    const kind = kindOfLabel.get(cells[0] ?? "");
    if (kind === undefined) continue;
    const row = new Map<ChipTone, string[]>();
    tones.forEach((tone, i) => {
      const cell = cells[i + 1]!;
      if (tone === "mid") {
        // 「それ以外（中）」の括弧の中が例の値
        const example = /^それ以外（(.+)）$/.exec(cell);
        if (example === null) throw new Error(`mid の列の形が違う: ${cell}`);
        row.set(tone, example[1]!.split("・"));
      } else {
        row.set(tone, cell === "—" ? [] : cell.split("・"));
      }
    });
    table.set(kind, row);
  }
  return table;
}

describe("M7-ai-04 recruitmentChipTone（11-6 §2.4.4。採用向けの分）", () => {
  it("チップの順は §2.4.3 の 5 の即戦力性 → 離職リスク → 総合判定（verdict のキー）", () => {
    expect(RECRUITMENT_CHIP_ORDER).toEqual(["sokusenryoku", "teichaku_risk", "sougou"]);
    expect(Object.isFrozen(RECRUITMENT_CHIP_ORDER)).toBe(true);
  });

  it("§2.4.4 の表のすべての値（表を仕様書から読む。mid は「それ以外」の例の値）", () => {
    const table = chipTableOfSpec();
    expect([...table.keys()]).toEqual([...RECRUITMENT_CHIP_ORDER]);
    // 即戦力性 5 値、離職リスク 6 値（「やや高い」を含む）、総合判定 4 値
    expect([...table.values()].map((row) => [...row.values()].flat().length)).toEqual([5, 6, 4]);
    for (const [kind, row] of table) {
      for (const [tone, values] of row) {
        for (const value of values) {
          expect(recruitmentChipTone(kind, value), `${kind} ${value}`).toBe(tone);
        }
      }
    }
  });

  it("出力のスキーマの値は、表のとおりに 4 色へ（即戦力性 5 値、離職リスク 5 値と「やや高い」、総合判定 4 値）", () => {
    const expected: Readonly<Record<RecruitmentChipKind, Readonly<Record<string, ChipTone>>>> = {
      sokusenryoku: {
        非常に高い: "good",
        高い: "good",
        中: "mid",
        低い: "warn",
        非常に低い: "warn",
      },
      teichaku_risk: {
        非常に低い: "good",
        低い: "good",
        中: "mid",
        やや高い: "warn",
        高い: "warn",
        非常に高い: "warn",
      },
      sougou: { 推奨: "good", 条件付きで推奨: "mid", 要検討: "warn", 非推奨: "bad" },
    };
    for (const kind of RECRUITMENT_CHIP_ORDER) {
      for (const [value, tone] of Object.entries(expected[kind])) {
        expect(recruitmentChipTone(kind, value), `${kind} ${value}`).toBe(tone);
      }
    }
    // スキーマの値（付録D §2）はどれも上の表にある（「やや高い」はスキーマに無いが参照元の規則どおり warn）
    const verdict = AiAnalysisOutputSchema.shape.verdict.shape;
    for (const kind of RECRUITMENT_CHIP_ORDER) {
      expect(
        verdict[kind].options.filter((value) => !(value in expected[kind])),
        kind,
      ).toEqual([]);
    }
    expect(verdict.teichaku_risk.options).not.toContain("やや高い");
  });

  it("値の空白（半角・全角・改行）を除いてから比べる", () => {
    expect(recruitmentChipTone("sokusenryoku", "高 い")).toBe("good");
    expect(recruitmentChipTone("sokusenryoku", "非常に\u3000低い")).toBe("warn");
    expect(recruitmentChipTone("teichaku_risk", " やや高い\n")).toBe("warn");
    expect(recruitmentChipTone("teichaku_risk", "\u3000低い\u3000")).toBe("good");
    expect(recruitmentChipTone("sougou", " 推奨 ")).toBe("good");
    expect(recruitmentChipTone("sougou", "要\n検討")).toBe("warn");
    expect(recruitmentChipTone("sougou", "非\u3000推奨")).toBe("bad");
    expect(recruitmentChipTone("sougou", "条件付きで\r\n推奨")).toBe("mid");
  });

  it("空（表示は「-」）と表に無い値は mid（ほかのチップの値・オブジェクトの持ち物の名前を含む）", () => {
    for (const kind of RECRUITMENT_CHIP_ORDER) {
      for (const value of ["", " ", "\u3000\n", "-", "toString", "constructor", "__proto__"]) {
        expect(recruitmentChipTone(kind, value), `${kind} ${JSON.stringify(value)}`).toBe("mid");
      }
    }
    expect(recruitmentChipTone("sokusenryoku", "やや高い")).toBe("mid"); // 「やや高い」は離職リスクだけ
    expect(recruitmentChipTone("sokusenryoku", "推奨")).toBe("mid");
    expect(recruitmentChipTone("teichaku_risk", "非推奨")).toBe("mid");
    expect(recruitmentChipTone("sougou", "高い")).toBe("mid");
    expect(recruitmentChipTone("sougou", "中")).toBe("mid");
  });
});

type PartsRow = readonly [
  status: AiGenerationStatus,
  busy: boolean,
  pollingTimedOut: boolean,
  expected: Omit<AiPanelParts, "context">,
  trainingContext: AiPanelParts["context"],
];

/** 案内・失敗の枠・生成ボタン・生成中・10 分を過ぎた枠・表示の組（§2.3.5 の表と §2.3.2〜§2.3.4） */
const NOT_STARTED = {
  intro: true,
  failure: false,
  button: true,
  generating: false,
  timeout: false,
  view: false,
};
const FAILED = {
  intro: true,
  failure: true,
  button: true,
  generating: false,
  timeout: false,
  view: false,
};
const WORKING = {
  intro: true,
  failure: false,
  button: false,
  generating: true,
  timeout: false,
  view: false,
};
const TIMED_OUT = {
  intro: true,
  failure: false,
  button: false,
  generating: false,
  timeout: true,
  view: false,
};
const VIEW = {
  intro: false,
  failure: false,
  button: false,
  generating: false,
  timeout: false,
  view: true,
};

/** 4 つの状態 × busy × pollingTimedOut の全部（育成・定着の 8 項目は最後の列） */
const PARTS_TABLE: readonly PartsRow[] = [
  ["not_generated", false, false, NOT_STARTED, "editable"],
  ["not_generated", false, true, NOT_STARTED, "editable"], // 読み直していないので 10 分の印は使わない
  ["not_generated", true, false, WORKING, "locked"], // 生成を始めるとすぐボタンを隠して生成中（§2.3.2）
  ["not_generated", true, true, TIMED_OUT, "locked"],
  ["generating", false, false, WORKING, "locked"],
  ["generating", false, true, TIMED_OUT, "locked"], // 生成中の代わりに T-29。ボタンは出さない（§2.3.4）
  ["generating", true, false, WORKING, "locked"],
  ["generating", true, true, TIMED_OUT, "locked"],
  ["completed", false, false, VIEW, "saved"],
  ["completed", false, true, VIEW, "saved"],
  ["completed", true, false, VIEW, "saved"], // 応答で completed になれば、要求の印が残っていても表示
  ["completed", true, true, VIEW, "saved"],
  ["failed", false, false, FAILED, "editable"], // 失敗の枠と同じ文言の生成ボタンで作り直す（§2.3.4）
  ["failed", false, true, FAILED, "editable"],
  ["failed", true, false, WORKING, "locked"], // 作り直しを始めたら失敗の枠も隠す
  ["failed", true, true, TIMED_OUT, "locked"],
];

describe("panelParts（11-6 §2.3.5 の状態と表示の対応）", () => {
  it("表は 4 つの状態 × busy × pollingTimedOut の全部を 1 回ずつ持つ", () => {
    const keys = PARTS_TABLE.map(([status, busy, timedOut]) => `${status} ${busy} ${timedOut}`);
    expect(new Set(keys).size).toBe(AI_GENERATION_STATUSES.length * 4);
    expect(PARTS_TABLE).toHaveLength(16);
  });

  it("採用向け: 生成前は案内・生成ボタン、生成中は案内・生成中（10 分を過ぎたら T-29）、生成済みは表示、失敗は案内・失敗の枠・生成ボタン", () => {
    for (const [status, busy, pollingTimedOut, expected] of PARTS_TABLE) {
      expect(
        panelParts("recruitment", { status, busy, pollingTimedOut }),
        `${status} busy=${busy} timedOut=${pollingTimedOut}`,
      ).toEqual({ ...expected, context: null });
    }
  });

  it("育成・定着: 採用向けと同じ部品に、8 項目（生成前・失敗は選べる、生成中は選べない、生成済みは保存した値で選べない）", () => {
    for (const [status, busy, pollingTimedOut, expected, context] of PARTS_TABLE) {
      expect(
        panelParts("training", { status, busy, pollingTimedOut }),
        `${status} busy=${busy} timedOut=${pollingTimedOut}`,
      ).toEqual({ ...expected, context });
    }
  });

  it("生成中と 10 分を過ぎた枠、失敗の枠と生成中、表示と案内は同時に出ない。返す値は凍結", () => {
    for (const kind of ["recruitment", "training"] as const) {
      for (const [status, busy, pollingTimedOut] of PARTS_TABLE) {
        const parts = panelParts(kind, { status, busy, pollingTimedOut });
        expect(parts.generating && parts.timeout).toBe(false);
        expect(parts.failure && (parts.generating || parts.timeout)).toBe(false);
        expect(parts.view && parts.intro).toBe(false);
        expect(Object.isFrozen(parts)).toBe(true);
      }
    }
  });
});

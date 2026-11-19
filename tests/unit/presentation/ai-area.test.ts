// AI 解説の領域の表示の規則（11-6 §3.7.10 の lib/presentation/ai-area.ts）。M7-ai-02（initialAiTab。11-6 §2.2。PR-7.9 の形: 出せる
// タブは責任者の受験で []、ほかは採用向けと育成・定着の 2 つ。責任者の受験で経年比較を選ぶ観点は PR-7.11a で足す）、M7-ai-04（採用向けの
// recruitmentChipTone は §2.4.4 の表、育成・定着の trainingChipTone は §2.5.5 の表を読んで比べる）、育成・定着の原因の札
// （hypothesisBadge。§2.5.5 の 3 の文言と、札の色を別表C の C.5 の規則で）、panelParts（§2.3.5 の表。4 つの状態 × この画面の要求・
// 読み直しの最中か × 読み直しが 10 分を過ぎたか を、採用向けと育成・定着で）、育成・定着の 8 項目の下書きと未選択の確かめ（§2.5.3・
// §2.5.4。M7-ai-39 の規則の部分。サーバの検証 trainingContextSchema と同じ規則であること）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { AiAnalysisOutputSchema, HYPOTHESIS_LEVELS, TrainingAiOutputSchema } from "@/lib/ai/schema";
import { AI_GENERATION_STATUSES, type AiGenerationStatus } from "@/lib/ai/types";
import { trainingContextSchema } from "@/lib/db/schemas/training-context";
import {
  TRAINING_CONTEXT_ITEMS,
  TRAINING_CONTEXT_KEYS,
  type TrainingContext,
  type TrainingContextKey,
} from "@/lib/masters/training-context";
import {
  EMPTY_TRAINING_CONTEXT_DRAFT,
  hypothesisBadge,
  initialAiTab,
  isTrainingContextCode,
  panelParts,
  RECRUITMENT_CHIP_ORDER,
  recruitmentChipTone,
  TRAINING_CHIP_ORDER,
  trainingChipTone,
  trainingContextDraftOf,
  trainingContextFromDraft,
  TRAINING_CONTEXT_ROWS,
  unselectedTrainingContextKeys,
  type AiPanelParts,
  type ChipTone,
  type HypothesisTone,
  type RecruitmentChipKind,
  type TrainingChipKind,
  type TrainingChipTone,
  type TrainingContextDraft,
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

/** 育成・定着の表示（§2.5.5）と、その CSS（別表C の C.5） */
const SECTION_2_5_5 = between(SPEC, "#### 2.5.5 ", "### 2.6 ");
const SECTION_C_5 = between(SPEC, "### C.5 ", "### C.6 ");

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

/** §2.5.5 の判定チップの色の表（チップ → 段階ごとの値。mid の列は「それ以外」で、値を書かない） */
function trainingChipTableOfSpec(): Map<TrainingChipKind, Map<TrainingChipTone, string[]>> {
  const lines = SECTION_2_5_5.split("\n");
  const header = lines.find((l) => l.startsWith("| チップ |"));
  if (header === undefined) throw new Error("§2.5.5 の判定チップの表の見出しが無い");
  // 見出しは「good #2E9B6F」の形（段階と点の色）
  const tones = header
    .split("|")
    .slice(2, -1)
    .map((c) => c.trim().split(" ")[0]) as TrainingChipTone[];
  expect(tones).toEqual(["good", "warn", "mid"]);
  const kindOfLabel = new Map(
    TRAINING_CHIP_ORDER.map((kind) => [AI_TEXTS.trainingView.chips[kind], kind]),
  );
  const table = new Map<TrainingChipKind, Map<TrainingChipTone, string[]>>();
  for (const line of lines) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    // 1 列目は「期待役割へのマッチ度（`clsMatch`）」の形（ラベルと参照元の関数の名前）
    const kind = kindOfLabel.get((cells[0] ?? "").replace(/（`\w+`）$/, ""));
    if (kind === undefined) continue;
    const row = new Map<TrainingChipTone, string[]>();
    tones.forEach((tone, i) => {
      const cell = cells[i + 1]!;
      if (tone === "mid") {
        if (cell !== "それ以外") throw new Error(`mid の列の形が違う: ${cell}`);
        row.set(tone, []); // good・warn の列に無い値
      } else {
        row.set(tone, cell.split("・"));
      }
    });
    table.set(kind, row);
  }
  return table;
}

describe("M7-ai-04 trainingChipTone（11-6 §2.5.5。育成・定着の分）", () => {
  /** 出力のスキーマの判定の 5 段階（§2.8.2 の LEVEL5。3 つのチップで同じ） */
  const verdict = TrainingAiOutputSchema.shape.verdict.shape;

  it("チップの順は §2.5.5 の 2 の期待役割へのマッチ度 → 離職リスク → サポートの必要度（verdict のキー）", () => {
    expect(TRAINING_CHIP_ORDER).toEqual(["match", "risk", "support"]);
    expect(Object.isFrozen(TRAINING_CHIP_ORDER)).toBe(true);
    expect(Object.keys(verdict)).toEqual([...TRAINING_CHIP_ORDER]);
  });

  it("§2.5.5 の表のすべての値（表を仕様書から読む。good・warn の列の値と、それ以外の列に当たるスキーマの値「中」は mid）", () => {
    const table = trainingChipTableOfSpec();
    expect([...table.keys()]).toEqual([...TRAINING_CHIP_ORDER]);
    for (const [kind, row] of table) {
      const listed = [...row.values()].flat();
      expect(listed, kind).toHaveLength(4);
      for (const [tone, values] of row) {
        for (const value of values) {
          expect(trainingChipTone(kind, value), `${kind} ${value}`).toBe(tone);
        }
      }
      const others = verdict[kind].options.filter((value) => !listed.includes(value));
      expect(others, kind).toEqual(["中"]);
      for (const value of others) {
        expect(trainingChipTone(kind, value), `${kind} ${value}`).toBe("mid");
      }
    }
  });

  it("3 つのチップ × 5 段: マッチ度は高いほど good、離職リスクとサポートの必要度は低いほど good（bad は使わない）", () => {
    const expected: Readonly<Record<TrainingChipKind, Readonly<Record<string, TrainingChipTone>>>> =
      {
        match: { 非常に高い: "good", 高い: "good", 中: "mid", 低い: "warn", 非常に低い: "warn" },
        risk: { 非常に高い: "warn", 高い: "warn", 中: "mid", 低い: "good", 非常に低い: "good" },
        support: { 非常に高い: "warn", 高い: "warn", 中: "mid", 低い: "good", 非常に低い: "good" },
      };
    for (const kind of TRAINING_CHIP_ORDER) {
      expect(Object.keys(expected[kind]).sort(), kind).toEqual([...verdict[kind].options].sort());
      for (const [value, tone] of Object.entries(expected[kind])) {
        expect(trainingChipTone(kind, value), `${kind} ${value}`).toBe(tone);
      }
    }
  });

  it("「やや高い」は育成・定着の表に無いので mid（採用向けの離職リスクの warn は今のまま）", () => {
    for (const kind of TRAINING_CHIP_ORDER) {
      expect(trainingChipTone(kind, "やや高い"), kind).toBe("mid");
    }
    expect(recruitmentChipTone("teichaku_risk", "やや高い")).toBe("warn");
  });

  it("値の空白（半角・全角・改行）を除いてから比べる", () => {
    expect(trainingChipTone("match", "高 い")).toBe("good");
    expect(trainingChipTone("risk", " 高い\n")).toBe("warn");
    expect(trainingChipTone("support", "非常に　低い")).toBe("good");
    expect(trainingChipTone("match", "低\r\nい")).toBe("warn");
    expect(trainingChipTone("support", "\t非常に高い ")).toBe("warn");
    expect(trainingChipTone("risk", "　中　")).toBe("mid");
  });

  it("空（表示は「-」）と表に無い値は mid（採用向けの総合判定の値・オブジェクトの持ち物の名前を含む）", () => {
    for (const kind of TRAINING_CHIP_ORDER) {
      for (const value of [
        "",
        " ",
        "　\n",
        "-",
        "推奨",
        "要検討",
        "非推奨",
        "toString",
        "constructor",
        "__proto__",
      ]) {
        expect(trainingChipTone(kind, value), `${kind} ${JSON.stringify(value)}`).toBe("mid");
      }
    }
  });

  it("段階は別表C の C.5 にある色のクラス（good・warn・mid。bad の規則は無い）で、各段階の点の色は §2.5.5 の表の見出しの色", () => {
    const header = SECTION_2_5_5.split("\n").find((l) => l.startsWith("| チップ |"))!;
    const dotOfTone = new Map(
      header
        .split("|")
        .slice(2, -1)
        .map((c) => c.trim().split(" ") as [string, string]),
    );
    // C.5 の根の変数（.mid .dot の地は var(--ai-1)）
    const variables = new Map(
      [...SECTION_C_5.matchAll(/--([\w-]+):(#[0-9A-Fa-f]{6})/g)].map((m) => [
        `var(--${m[1]})`,
        m[2]!,
      ]),
    );
    for (const tone of ["good", "warn", "mid"] as const) {
      const dot = new RegExp(`#ai \\.ai-ik \\.${tone} \\.dot\\{background:([^;}]+)\\}`).exec(
        SECTION_C_5,
      )?.[1];
      expect(dot, tone).toBeDefined();
      expect(variables.get(dot!) ?? dot, tone).toBe(dotOfTone.get(tone));
      expect(SECTION_C_5, tone).toContain(`#ai .ai-ik .${tone} .v{color:`);
    }
    expect(SECTION_C_5).not.toMatch(/\.bad\b/);
  });
});

describe("hypothesisBadge（11-6 §2.5.5 の 3。育成・定着の原因の札）", () => {
  /** §2.5.5 の表の 3 の行（1. すぐに手を打つべき理由と、その一手） */
  const row3 = SECTION_2_5_5.split("\n").find((l) => l.startsWith("| 3 | "))!;

  /** C.5 の .hk の段階の規則の地と文字の色 */
  function badgeColorsOf(tone: HypothesisTone): [string, string] | null {
    const rule = new RegExp(
      `#ai \\.ai-ik \\.hk\\.${tone}\\{background:(#\\w{6});color:(#\\w{6})\\}`,
    ).exec(SECTION_C_5);
    return rule === null ? null : [rule[1]!, rule[2]!];
  }

  it("文言は level が「診断外」なら「診断外」、それ以外は「可能性 」+ level（§2.5.5 の例「可能性 高」）", () => {
    const example = /（例「([^「」]+)」）/.exec(row3)?.[1];
    expect(example).toBe("可能性 高");
    expect(hypothesisBadge("高").text).toBe(example);
    expect(hypothesisBadge("中").text).toBe("可能性 中");
    expect(hypothesisBadge("診断外").text).toBe("診断外");
  });

  it("色は「高」が hi、「中」が mi、それ以外が lo で、各段階の C.5 の .hk の地と文字は §2.5.5 の札の色", () => {
    const colors =
      /札の色: 「(.)」= 地 (#\w{6})・文字 (#\w{6})、「(.)」= 地 (#\w{6})・文字 (#\w{6})、それ以外 = 地 (#\w{6})・文字 (#\w{6})/.exec(
        row3,
      );
    expect(colors).not.toBeNull();
    const [, highLevel, highBg, highFg, midLevel, midBg, midFg, otherBg, otherFg] = colors!;
    expect([highLevel, midLevel]).toEqual(["高", "中"]);
    expect(badgeColorsOf(hypothesisBadge(highLevel!).tone)).toEqual([highBg, highFg]);
    expect(badgeColorsOf(hypothesisBadge(midLevel!).tone)).toEqual([midBg, midFg]);
    for (const level of ["診断外", "低", "高い", ""]) {
      expect(badgeColorsOf(hypothesisBadge(level).tone), level).toEqual([otherBg, otherFg]);
    }
    // 出力のスキーマの 3 つの値（§2.8.2 の HYPOTHESIS_LEVELS）
    expect(HYPOTHESIS_LEVELS.map((level) => hypothesisBadge(level).tone)).toEqual([
      "hi",
      "mi",
      "lo",
    ]);
  });

  it("出力のスキーマに無い値は「可能性 」+ level で lo（オブジェクトの持ち物の名前を含む。level の空白は除かない）", () => {
    expect(hypothesisBadge("低")).toEqual({ text: "可能性 低", tone: "lo" });
    expect(hypothesisBadge("")).toEqual({ text: "可能性 ", tone: "lo" });
    for (const level of ["toString", "constructor", "__proto__", "hasOwnProperty"]) {
      expect(hypothesisBadge(level), level).toEqual({ text: `可能性 ${level}`, tone: "lo" });
    }
    expect(hypothesisBadge("高 ")).toEqual({ text: "可能性 高 ", tone: "lo" });
    expect(hypothesisBadge(" 診断外")).toEqual({ text: "可能性  診断外", tone: "lo" });
  });

  it("返す値は凍結", () => {
    for (const level of [...HYPOTHESIS_LEVELS, "低"]) {
      expect(Object.isFrozen(hypothesisBadge(level)), level).toBe(true);
    }
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

describe("育成・定着の 8 項目の入力欄の並びと選択肢（11-6 §2.5.3 の表。TRAINING_CONTEXT_ROWS）", () => {
  it("2 行 × 4 列で、各項目のラベル・コード・選択肢（先頭は値が空の「選択してください」、続けて表の上からの表示名）は §2.5.3 の表のとおり", () => {
    const section = between(SPEC, "#### 2.5.3 ", "#### 2.5.4 ");
    const rows = [...section.matchAll(/^\| (\d) \| (\d) \| ([^|]+) \| `(\w+)` \| (.+) \|$/gm)];
    expect(rows).toHaveLength(8);
    expect(TRAINING_CONTEXT_ROWS.map((row) => row.length)).toEqual([4, 4]);
    for (const [, row, column, label, key, cell] of rows) {
      const field = TRAINING_CONTEXT_ROWS[Number(row) - 1]![Number(column) - 1]!;
      expect(field.key, `${row}-${column}`).toBe(key);
      expect(field.label, key).toBe(label);
      expect(field.choices, key).toEqual([
        { value: "", label: AI_TEXTS.trainingContext.placeholder },
        ...[...cell!.matchAll(/`(\w+)`「([^「」]+)」/g)].map((m) => ({ value: m[1], label: m[2] })),
      ]);
    }
    expect(TRAINING_CONTEXT_ROWS.flat().map((field) => field.key)).toEqual([
      ...TRAINING_CONTEXT_KEYS,
    ]);
  });

  it("選択肢の値は、先頭の空の文字（未選択）のほかはその項目の選択肢のコード。凍結", () => {
    for (const field of TRAINING_CONTEXT_ROWS.flat()) {
      const [first, ...rest] = field.choices;
      expect(first, field.key).toEqual({ value: "", label: "選択してください" });
      expect(isTrainingContextCode(field.key, first!.value), field.key).toBe(false);
      for (const choice of rest) {
        expect(isTrainingContextCode(field.key, choice.value), choice.value).toBe(true);
      }
      expect(Object.isFrozen(field) && Object.isFrozen(field.choices), field.key).toBe(true);
    }
    expect(TRAINING_CONTEXT_ROWS.every((row) => Object.isFrozen(row))).toBe(true);
    expect(Object.isFrozen(TRAINING_CONTEXT_ROWS)).toBe(true);
  });
});

/** 11-6 §3.4 の要求の例の 8 項目（POST …/ai-analysis/training の本文の context。仕様書から読む） */
function contextExampleOfSpec(): TrainingContext {
  const row = between(SPEC, "### 3.4 ", "### 3.5 ")
    .split("\n")
    .find((l) => l.startsWith("| 要求（POST） |"));
  const json = row === undefined ? undefined : /`training`: `([^`]+)`/.exec(row)?.[1];
  if (json === undefined) throw new Error("§3.4 の育成・定着の要求の例が無い");
  return (JSON.parse(json) as { readonly context: TrainingContext }).context;
}

/** 1 つの欄の値を変えた下書き（選択欄で選んだときと同じく、もとの下書きは変えない） */
function withValue(
  draft: TrainingContextDraft,
  key: TrainingContextKey,
  code: string,
): TrainingContextDraft {
  return { ...draft, [key]: code };
}

describe("育成・定着の 8 項目の下書きと未選択の確かめ（11-6 §2.5.3・§2.5.4。M7-ai-39 の規則の部分）", () => {
  const EXAMPLE = contextExampleOfSpec();
  const FILLED: TrainingContextDraft = { ...EMPTY_TRAINING_CONTEXT_DRAFT, ...EXAMPLE };

  it("§3.4 の要求の例は 8 項目のすべてで、サーバの検証（trainingContextSchema）を通る", () => {
    expect(Object.keys(EXAMPLE)).toEqual([...TRAINING_CONTEXT_KEYS]);
    expect(trainingContextSchema.parse(EXAMPLE)).toEqual(EXAMPLE);
  });

  it("空の下書きは 8 項目とも未選択（値は空の文字。キーは画面の並び）で、凍結。生成の本文は作らない", () => {
    expect(Object.keys(EMPTY_TRAINING_CONTEXT_DRAFT)).toEqual([...TRAINING_CONTEXT_KEYS]);
    expect(Object.values(EMPTY_TRAINING_CONTEXT_DRAFT)).toEqual(
      TRAINING_CONTEXT_KEYS.map(() => ""),
    );
    expect(Object.isFrozen(EMPTY_TRAINING_CONTEXT_DRAFT)).toBe(true);
    expect(unselectedTrainingContextKeys(EMPTY_TRAINING_CONTEXT_DRAFT)).toEqual([
      ...TRAINING_CONTEXT_KEYS,
    ]);
    expect(trainingContextFromDraft(EMPTY_TRAINING_CONTEXT_DRAFT)).toBeNull();
  });

  it("3 つだけ選ぶと、未選択の 5 つを画面の並び（1 行目 → 2 行目）で返し、生成の本文は作らない。1 つ選び直すとその欄が外れる", () => {
    let draft = EMPTY_TRAINING_CONTEXT_DRAFT;
    draft = withValue(draft, "concern", EXAMPLE.concern);
    draft = withValue(draft, "tenure", EXAMPLE.tenure);
    draft = withValue(draft, "recentState", EXAMPLE.recentState);
    // 先頭（evaluation）が、押したときに焦点を移す欄（§2.5.4 の 1。焦点を移すのは部品）
    expect(unselectedTrainingContextKeys(draft)).toEqual([
      "evaluation",
      "expectedRole",
      "relationship",
      "wish",
      "changeSinceJoining",
    ]);
    expect(trainingContextFromDraft(draft)).toBeNull();
    expect(
      unselectedTrainingContextKeys(withValue(draft, "relationship", EXAMPLE.relationship)),
    ).toEqual(["evaluation", "expectedRole", "wish", "changeSinceJoining"]);
    // 選んだ欄を「選択してください」（値は空）に戻すと、また未選択になる
    expect(unselectedTrainingContextKeys(withValue(draft, "tenure", ""))[0]).toBe("tenure");
    // もとの下書きは変わらない
    expect(EMPTY_TRAINING_CONTEXT_DRAFT.concern).toBe("");
  });

  it("8 つそろえば、生成の要求の本文の context を 8 つのキーだけで返し（下書きの余分な持ち物は入れない）、サーバの検証を通る", () => {
    expect(unselectedTrainingContextKeys(FILLED)).toEqual([]);
    const context = trainingContextFromDraft(FILLED);
    expect(context).toEqual(EXAMPLE);
    expect(Object.keys(context!)).toEqual([...TRAINING_CONTEXT_KEYS]);
    expect(trainingContextSchema.parse(context)).toEqual(EXAMPLE);
    // サーバは context の中の余分なキーを 422 で拒むので、本文には 8 つのキーだけを入れる
    const extra = { ...FILLED, note: "x" } as TrainingContextDraft;
    expect(Object.keys(trainingContextFromDraft(extra)!)).toEqual([...TRAINING_CONTEXT_KEYS]);
    expect(trainingContextSchema.safeParse(trainingContextFromDraft(extra)).success).toBe(true);
  });

  it("その項目の選択肢に無いコード（ほかの項目のコード・空白の付いたコード・オブジェクトの持ち物の名前）は未選択として扱う", () => {
    for (const [key, code] of [
      ["tenure", "year_7"],
      ["evaluation", "good"], // 他スタッフとの関係のコード
      ["wish", "growing"], // 現在の評価・入職時と比べた変化のコード
      ["concern", " few_reports"],
      ["expectedRole", "toString"],
      ["relationship", "__proto__"],
    ] as const) {
      const draft = withValue(FILLED, key, code);
      expect(unselectedTrainingContextKeys(draft), `${key}=${code}`).toEqual([key]);
      expect(trainingContextFromDraft(draft), `${key}=${code}`).toBeNull();
    }
  });

  it("isTrainingContextCode はサーバの検証（trainingContextSchema の各項目の列挙）と同じ規則（8 項目 × どの項目のコードと空）", () => {
    const allCodes = new Set(
      TRAINING_CONTEXT_KEYS.flatMap((key) =>
        TRAINING_CONTEXT_ITEMS[key].options.map((o) => o.code),
      ),
    );
    for (const key of TRAINING_CONTEXT_KEYS) {
      for (const option of TRAINING_CONTEXT_ITEMS[key].options) {
        expect(isTrainingContextCode(key, option.code), `${key}=${option.code}`).toBe(true);
      }
      for (const code of [...allCodes, "", "toString", "constructor"]) {
        expect(isTrainingContextCode(key, code), `${key}=${code}`).toBe(
          trainingContextSchema.shape[key].safeParse(code).success,
        );
      }
    }
  });

  it("保存した 8 項目から下書きを作る（null は空の下書き、選択肢に無いコードの項目は未選択）。入力は変えない", () => {
    expect(trainingContextDraftOf(null)).toEqual(EMPTY_TRAINING_CONTEXT_DRAFT);
    const saved = Object.freeze({ ...EXAMPLE });
    const draft = trainingContextDraftOf(saved);
    expect(draft).toEqual(EXAMPLE);
    expect(draft).not.toBe(saved);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(trainingContextFromDraft(draft)).toEqual(EXAMPLE);
    const broken = trainingContextDraftOf({ ...EXAMPLE, wish: "unknown_code" });
    expect(broken).toEqual({ ...EXAMPLE, wish: "" });
    expect(unselectedTrainingContextKeys(broken)).toEqual(["wish"]);
    expect(saved).toEqual(EXAMPLE);
  });
});

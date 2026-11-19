// U-15（08 §3.2.2）: lib/ai/prompts/recruitment-v1.ts が付録D §3 と一致すること（07 §2.2、D07-03）。
// 種類の版の引き方 getPromptDefinitionForKind と本番で使えるか approvedForProduction（11-6 §2.7.4・§3.7.2）。
// M7-ai-06（11-6 §5.1）: lib/ai/prompts/training-v1.ts が 11-6 別表A と一字一句同じで、K-19 の対象の語が残らないこと
import { describe, expect, it } from "vitest";

import { AiProviderError } from "@/lib/ai/errors";
import { placeholderValues } from "@/lib/ai/prompt-builder";
import {
  getPromptDefinition,
  getPromptDefinitionForKind,
  isKnownPromptVersion,
  PROMPT_REGISTRY,
  PROMPT_VERSIONS,
} from "@/lib/ai/prompts";
import { RECRUITMENT_V1 } from "@/lib/ai/prompts/recruitment-v1";
import { RECRUITMENT_V2, RECRUITMENT_V2_REPLACEMENTS } from "@/lib/ai/prompts/recruitment-v2";
import {
  TRAINING_V1,
  TRAINING_V1_SYSTEM,
  TRAINING_V1_USER_TEMPLATE,
} from "@/lib/ai/prompts/training-v1";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { COMPATIBILITY_DEFINITIONS } from "@/lib/masters/indicators/compatibility";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";

import {
  readAppendixDPrompt,
  readAppendixDTrainingPrompt,
  readTrainingV1Appendix,
  t06TrainingInput,
} from "./helpers";

/** 付録D の山括弧の名前 → テンプレートのプレースホルダ名（ラベル表記はマスタから引き、リスクだけは付録D 固有の名前） */
function placeholderNameMap(): Map<string, string> {
  const map = new Map<string, string>([
    ["氏名", "name"],
    ["職種", "occupation"],
    ["信頼係数", "reliability"],
    ["適性タイプ", "aptitudeType"],
    ["リスク_不祥事", "risk.misconduct"],
    ["リスク_苦情", "risk.complaint"],
    ["リスク_メンタル不服", "risk.mental_distress"],
    ["リスク_不注意ミス", "risk.careless_mistake"],
    ["リスク_退職トラブル", "risk.resignation_trouble"],
    ["リスク_コミュ支障", "risk.communication_issue"],
    ["リスク_就業辞退", "risk.low_motivation"],
  ]);
  for (const d of TRAIT_DEFINITIONS) map.set(d.label, `trait.${d.key}`);
  for (const d of SOCIAL_STYLE_DEFINITIONS)
    map.set(`SS_${d.labelKatakana}`, `socialStyle.${d.key}`);
  for (const d of APTITUDE_DEFINITIONS) map.set(`資質_${d.label}`, `aptitude.${d.key}`);
  for (const d of COMPATIBILITY_DEFINITIONS) map.set(`相性_${d.label}`, `compatibility.${d.key}`);
  return map;
}

describe("U-15 recruitment-v1 と付録D §3", () => {
  const appendix = readAppendixDPrompt();

  it("system は付録D の本文（JSON 文字列のエスケープを戻したもの）と「コンタクター → コンダクター」の 1 語以外で一致する", () => {
    const decoded = appendix.system.replace(/\\"/g, '"');
    // 付録D 側の誤記は 1 箇所だけ（07 D07-03）
    expect(decoded.split("コンタクター").length - 1).toBe(1);
    expect(RECRUITMENT_V1.system).toBe(decoded.replace("コンタクター", "コンダクター"));
    expect(RECRUITMENT_V1.system).not.toContain("コンタクター");
    expect(RECRUITMENT_V1.system).toContain("コンダクター=人を活かす大組織のリーダー");
    // 付録D のまま残す表記（00 §1.4、07 D07-04）
    expect(RECRUITMENT_V1.system).toContain("直感型／感性" + "解放型（言語感覚）");
    expect(RECRUITMENT_V1.system).toContain("# 資質タイプ（各0〜100。");
    expect(RECRUITMENT_V1.system.startsWith("# あなたの役割\n")).toBe(true);
    expect(RECRUITMENT_V1.system).toContain('{"label":"関わり方","text":"..."}');
  });

  it("userTemplate は付録D のテンプレートの山括弧を {{…}} に置き換えたもの（ラベル・順序が同じ）", () => {
    const names = placeholderNameMap();
    const expected = appendix.user.replace(/<([^<>]+)>/g, (_m, name: string) => {
      const key = names.get(name);
      if (!key) throw new Error(`付録D の未知の差し込み位置: ${name}`);
      return `{{${key}}}`;
    });
    expect(RECRUITMENT_V1.userTemplate).toBe(expected);
    expect(RECRUITMENT_V1.userTemplate).not.toMatch(/[<>]/);
    // 付録D の差し込み位置 34 個（氏名・職種・信頼係数・16 尺度・4 スタイル・4 資質・適性タイプ・5 相性・7 リスク）
    expect(RECRUITMENT_V1.userTemplate.match(/\{\{[^}]+\}\}/g)).toHaveLength(
      3 + 16 + 4 + 4 + 1 + 5 + 7,
    );
  });

  it("版と分析種別", () => {
    expect(RECRUITMENT_V1.version).toBe("recruitment-v1");
    expect(RECRUITMENT_V1.analysisKind).toBe("recruitment");
  });
});

describe("プロンプトのレジストリ（07 §2.2）", () => {
  it("PROMPT_VERSIONS と PROMPT_REGISTRY のキー集合が一致し、各定義の version がキーと一致する", () => {
    expect(Object.keys(PROMPT_REGISTRY).sort()).toEqual([...PROMPT_VERSIONS].sort());
    for (const [key, def] of Object.entries(PROMPT_REGISTRY)) expect(def.version).toBe(key);
  });

  it("getPromptDefinition: 既知の版は定義、未知の版は config_error", () => {
    expect(getPromptDefinition("recruitment-v1")).toBe(RECRUITMENT_V1);
    expect(getPromptDefinition("recruitment-v2")).toBe(RECRUITMENT_V2);
    expect(getPromptDefinition("training-v1")).toBe(TRAINING_V1);
    expect(isKnownPromptVersion("recruitment-v3")).toBe(false);
    expect(() => getPromptDefinition("recruitment-v3")).toThrow(AiProviderError);
  });

  it("登録されている版は採用向けの 2 つと育成・定着の training-v1（経年比較の longitudinal-v1 は PR-7.11b が足す）", () => {
    expect([...PROMPT_VERSIONS]).toEqual(["recruitment-v1", "recruitment-v2", "training-v1"]);
    expect(
      Object.fromEntries(Object.entries(PROMPT_REGISTRY).map(([k, d]) => [k, d.analysisKind])),
    ).toEqual({
      "recruitment-v1": "recruitment",
      "recruitment-v2": "recruitment",
      "training-v1": "training",
    });
  });

  it("approvedForProduction（11-6 §2.7.4）: 採用向けの v1・v2 は真、依頼主の確認の前の training-v1 は偽", () => {
    expect(RECRUITMENT_V1.approvedForProduction).toBe(true);
    expect(RECRUITMENT_V2.approvedForProduction).toBe(true);
    expect(TRAINING_V1.approvedForProduction).toBe(false);
  });

  it("getPromptDefinitionForKind（11-6 §3.7.2）: 種類の合う版は定義、種類の違う版・未知の版は config_error（文は版と種類の名前だけ）", () => {
    const def = getPromptDefinitionForKind("recruitment", "recruitment-v2");
    expect(def).toBe(RECRUITMENT_V2);
    expect(def.analysisKind).toBe("recruitment");
    expect(getPromptDefinitionForKind("recruitment", "recruitment-v1")).toBe(RECRUITMENT_V1);
    const training = getPromptDefinitionForKind("training", "training-v1");
    expect(training).toBe(TRAINING_V1);
    expect(training.analysisKind).toBe("training");

    const cases = [
      ["training", "recruitment-v2", "prompt version recruitment-v2 is not for training"],
      ["recruitment", "training-v1", "prompt version training-v1 is not for recruitment"],
      ["longitudinal", "recruitment-v1", "prompt version recruitment-v1 is not for longitudinal"],
      ["longitudinal", "training-v1", "prompt version training-v1 is not for longitudinal"],
      ["recruitment", "recruitment-v9", "unknown prompt version: recruitment-v9"],
      ["training", "training-v2", "unknown prompt version: training-v2"],
    ] as const;
    for (const [kind, version, message] of cases) {
      let caught: unknown;
      try {
        getPromptDefinitionForKind(kind, version);
      } catch (error) {
        caught = error;
      }
      expect(caught, `${kind} ${version}`).toBeInstanceOf(AiProviderError);
      expect((caught as AiProviderError).reason).toBe("config_error");
      expect((caught as AiProviderError).message).toBe(message);
    }
  });
});

describe("recruitment-v2（アイリストのサロン向け。10 K-19）", () => {
  it("v1 の本文に置き換え表を当てたものと一致し、歯科・医療の文脈が残っていない", () => {
    let expected = RECRUITMENT_V1.system;
    for (const [from, to] of RECRUITMENT_V2_REPLACEMENTS) {
      expect(expected.split(from).length - 1).toBe(1);
      expected = expected.replace(from, to);
    }
    expect(RECRUITMENT_V2.system).toBe(expected);
    expect(RECRUITMENT_V2.system).not.toMatch(/院長|歯科|クリニック|医院|滅菌/);
    expect(RECRUITMENT_V2.system).toContain(
      "アイリスト（まつげエクステ・まつげパーマなどの施術者）",
    );
    expect(RECRUITMENT_V2.system).toContain("多忙なサロンの責任者が");
  });

  it("入力テンプレートは v1 と同じ（判定基準・出力形式は上の置き換え以外 v1 と同じ）", () => {
    expect(RECRUITMENT_V2.userTemplate).toBe(RECRUITMENT_V1.userTemplate);
    expect(RECRUITMENT_V2.version).toBe("recruitment-v2");
    expect(RECRUITMENT_V2.analysisKind).toBe("recruitment");
  });
});

describe("M7-ai-06 training-v1 と 11-6 別表A（11-6 §2.7.2）", () => {
  const appendix = readTrainingV1Appendix();
  /** 置き換えの対象の語（K-19・K-32 ⑪。11-6 §2.7.2 の確かめの語。§0.5・付録C の K-19 の対象を含む） */
  const REPLACED_WORDS = [
    "歯科",
    "院長",
    "医院",
    "クリニック",
    "他院",
    "滅菌",
    "器具準備",
    "アシスト業務",
    "スケーリング",
    "衛生士",
    "助手",
    "コンタクター",
    "停滞",
  ];

  it("system は別表A §A.1 の囲みの中身と一字一句同じ（7,511 字。末尾に改行 1 つ）", () => {
    expect(TRAINING_V1_SYSTEM).toBe(appendix.system);
    expect(TRAINING_V1.system).toBe(TRAINING_V1_SYSTEM);
    expect([...TRAINING_V1_SYSTEM]).toHaveLength(7511);
    expect(TRAINING_V1_SYSTEM.endsWith("積極的に入れる。\n")).toBe(true);
    expect(TRAINING_V1_SYSTEM.endsWith("\n\n")).toBe(false);
    // 参照元どおり残すもの（11-6 §2.7.2）: 「# 判定基準」の前の 2 行の空行と、出力に無い cautions・retention を指す行
    expect(TRAINING_V1_SYSTEM).toContain("70以上は強く警告。\n\n\n# 判定基準（");
    expect(TRAINING_V1_SYSTEM).toContain("→ cautions と retention（特にsign・action）に、");
    // 行頭の空白（4 つ・2 つ）も残す
    expect(TRAINING_V1_SYSTEM).toContain(
      "\n    ・入職時と比べた変化が「以前より消極的になった」\n",
    );
    expect(TRAINING_V1_SYSTEM).toContain("\n  - badge: 「STEP 1」など。");
  });

  it("user テンプレートは別表A §A.2 の囲みの中身から末尾の改行 1 つを除いたもの（1,597 字・30 行）", () => {
    expect(appendix.user.endsWith("\n")).toBe(true);
    expect(TRAINING_V1_USER_TEMPLATE).toBe(appendix.user.slice(0, -1));
    expect(TRAINING_V1.userTemplate).toBe(TRAINING_V1_USER_TEMPLATE);
    expect(TRAINING_V1_USER_TEMPLATE.endsWith("\n")).toBe(false);
    expect([...TRAINING_V1_USER_TEMPLATE]).toHaveLength(1597);
    expect(TRAINING_V1_USER_TEMPLATE.split("\n")).toHaveLength(30);
  });

  it("置き換えの対象の語が残らず、置き換えた後の語がある", () => {
    for (const word of REPLACED_WORDS) {
      expect(TRAINING_V1_SYSTEM, word).not.toContain(word);
      expect(TRAINING_V1_USER_TEMPLATE, word).not.toContain(word);
    }
    expect(TRAINING_V1_SYSTEM).toContain("コンダクター=人を活かす大組織のリーダー");
    expect(TRAINING_V1_SYSTEM).toContain("入職時と比べた変化が「以前より消極的になった」");
    expect(TRAINING_V1_SYSTEM).toContain("責任者・幹部");
    expect(TRAINING_V1_SYSTEM).toContain("他サロンからの誘い");
    expect(TRAINING_V1_USER_TEMPLATE.split("\n")[4]).toBe("【責任者・幹部の入力】");
  });

  it("user の 15 行目から後は recruitment-v1 の user テンプレートの 5 行目から後と同じ", () => {
    expect(TRAINING_V1_USER_TEMPLATE.split("\n").slice(14)).toEqual(
      RECRUITMENT_V1.userTemplate.split("\n").slice(4),
    );
  });

  it("差し込みは 48 種（1 回ずつ）で、育成・定着の placeholderValues のキーと一致する", () => {
    const names = [...TRAINING_V1_USER_TEMPLATE.matchAll(/\{\{([A-Za-z_.]+)\}\}/g)].map(
      (m) => m[1],
    );
    expect(names).toHaveLength(48);
    expect(new Set(names).size).toBe(48);
    expect([...placeholderValues("training", t06TrainingInput()).keys()].sort()).toEqual(
      [...names].sort(),
    );
  });

  it("付録D §6 の 2 つの囲みは別表A と同じで、コードの system と user テンプレート（末尾の改行 1 つを除く）と一字一句同じ（11-6 §4.1）", () => {
    const appendixD = readAppendixDTrainingPrompt();
    expect(appendixD).toEqual(appendix);
    expect(appendixD.system).toBe(TRAINING_V1_SYSTEM);
    expect(appendixD.user.slice(0, -1)).toBe(TRAINING_V1_USER_TEMPLATE);
    expect(appendixD.user.endsWith("\n")).toBe(true);
  });

  it("版と分析種別", () => {
    expect(TRAINING_V1.version).toBe("training-v1");
    expect(TRAINING_V1.analysisKind).toBe("training");
  });
});

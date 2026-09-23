// U-15（08 §3.2.2）: lib/ai/prompts/recruitment-v1.ts が付録D §3 と一致すること（07 §2.2、D07-03）
import { describe, expect, it } from "vitest";

import { AiProviderError } from "@/lib/ai/errors";
import {
  getPromptDefinition,
  isKnownPromptVersion,
  PROMPT_REGISTRY,
  PROMPT_VERSIONS,
} from "@/lib/ai/prompts";
import { RECRUITMENT_V1 } from "@/lib/ai/prompts/recruitment-v1";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { COMPATIBILITY_DEFINITIONS } from "@/lib/masters/indicators/compatibility";
import { SOCIAL_STYLE_DEFINITIONS } from "@/lib/masters/indicators/social-styles";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";

import { readAppendixDPrompt } from "./helpers";

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
    expect(isKnownPromptVersion("recruitment-v2")).toBe(false);
    expect(() => getPromptDefinition("recruitment-v2")).toThrow(AiProviderError);
  });
});

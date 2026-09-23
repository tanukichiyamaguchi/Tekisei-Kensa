// U-11（08 §3.2.2）: lib/ai/prompt-builder.ts・input.ts・prompts/ の埋め込み規則（07 §2.3、§2.4）
import { describe, expect, it } from "vitest";

import { AiProviderError } from "@/lib/ai/errors";
import {
  buildAiAnalysisInput,
  formatAptitudeTypeForAi,
  formatCompatibilityForAi,
  formatReliabilityForAi,
  formatRiskForAi,
  formatSocialStyleForAi,
} from "@/lib/ai/input";
import { buildMessages, fillTemplate } from "@/lib/ai/prompt-builder";
import { RECRUITMENT_V1 } from "@/lib/ai/prompts/recruitment-v1";
import { APTITUDE_DEFINITIONS } from "@/lib/masters/indicators/aptitudes";
import { RISK_DEFINITIONS } from "@/lib/masters/indicators/risks";
import { TRAIT_DEFINITIONS } from "@/lib/masters/indicators/traits";
import { scoreAnswers } from "@/lib/scoring/score";
import type { ScoreResult } from "@/lib/scoring/types";

import { cyclicAnswers } from "../scoring/helpers";
import { t06Input } from "./helpers";

/** 07 §2.4 のユーザー入力の例（T-06 を埋めたもの） */
const EXPECTED_T06_USER = `【氏名】山田 太郎
【評価する職種】アイリスト（アシスタント・見習い）
【信頼係数】79%

【性格特性｜0〜30, 15=平均】
コミュニケーション力:17 協力性:15 適応力:13.5 優劣性:14 謙虚さ:13 反省力:14.5 規則遵守力:18.5 こだわり:13 感情の豊かさ:13.5 敏感さ:16 自己肯定感:15.5 革新的思考:13.5 行動力:15.5 前向きさ:16 リーダーシップ:16 発想力:13

【ソーシャルスタイル｜0〜30, 最高点が主軸】
ドライビング:4.75 エクスプレッシブ:3.75 エミアブル:4 アナリティカル:3.25

【資質｜0〜100, 最高=第一候補/2位=第二候補】
直感型:13.75 柔軟型:7.5 目標達成型:22.5 専門追求型:12.5

【適性タイプ】パイオニア

【組織との相性｜0〜100】
適応する環境:0 適応する業務:0 思考の傾向:11 意思決定:0 ストレス耐性:0

【リスク｜0〜100, 高いほど危険】
不祥事:27.5 苦情:47.5 メンタル不服:30 不注意ミス:57.5 退職トラブル:42.5 コミュ起因の支障:52.5 就業辞退:42.5`;

describe("U-11 buildMessages", () => {
  it("T-06 の ScoreResult で 07 §2.4 のユーザー入力と一致し、system は定義そのもの", () => {
    const messages = buildMessages(t06Input(), "recruitment-v1");
    expect(messages.user).toBe(EXPECTED_T06_USER);
    expect(messages.system).toBe(RECRUITMENT_V1.system);
    expect(messages.user).not.toContain("{{");
    expect(messages.user).not.toContain("}}");
  });

  it("純関数: 同じ入力で同じ文字列（日時・乱数を含めない）", () => {
    const a = buildMessages(t06Input(), "recruitment-v1");
    const b = buildMessages(t06Input(), "recruitment-v1");
    expect(a).toEqual(b);
  });

  it("未知のプロンプト版は config_error", () => {
    expect(() => buildMessages(t06Input(), "recruitment-v0")).toThrow(AiProviderError);
    try {
      buildMessages(t06Input(), "recruitment-v0");
    } catch (error) {
      expect((error as AiProviderError).reason).toBe("config_error");
    }
  });

  it("負値（スタイル・相性・リスク）は 0、資質の 100 超はそのまま、信頼係数は四捨五入", () => {
    const base = scoreAnswers(cyclicAnswers());
    const result: ScoreResult = {
      ...base,
      reliability: 89.5,
      socialStyles: { ...base.socialStyles, driving: -1.5, expressive: 28.75 },
      aptitudes: { ...base.aptitudes, sensory_open: 122.5, environment_receptive: 68.75 },
      compatibility: { ...base.compatibility, adaptive_environment: -7, adaptive_work: 83 },
      risks: { ...base.risks, misconduct: -5, complaint: 37.5, careless_mistake: 110 },
      aptitudeType: "conductor",
    };
    const user = buildMessages(t06Input({ result }), "recruitment-v1").user;
    expect(user).toContain("【信頼係数】90%");
    expect(user).toContain("ドライビング:0 エクスプレッシブ:28.75");
    expect(user).toContain("直感型:122.5 柔軟型:68.75");
    expect(user).toContain("適応する環境:0 適応する業務:83");
    expect(user).toContain("不祥事:0 苦情:37.5");
    expect(user).toContain("不注意ミス:110");
    expect(user).toContain("【適性タイプ】コンダクター");
  });

  it("値に {{ が含まれても再展開しない。氏名は前後の空白を除く", () => {
    const user = buildMessages(
      t06Input({ respondentName: "  {{name}} 花子 " }),
      "recruitment-v1",
    ).user;
    expect(user.startsWith("【氏名】{{name}} 花子\n")).toBe(true);
  });

  it("テンプレートに未知のプレースホルダがあれば config_error", () => {
    expect(() => fillTemplate("{{unknown}}", new Map())).toThrow(AiProviderError);
  });
});

describe("U-11 埋め込み規則とラベル", () => {
  it("整形関数（07 §2.3）", () => {
    expect(formatReliabilityForAi(78.685)).toBe("79");
    expect(formatReliabilityForAi(89.71)).toBe("90");
    expect(formatSocialStyleForAi(-0.25)).toBe("0");
    expect(formatSocialStyleForAi(4)).toBe("4");
    expect(formatCompatibilityForAi(-13)).toBe("0");
    expect(formatCompatibilityForAi(11)).toBe("11");
    expect(formatRiskForAi(-2.5)).toBe("0");
    expect(formatRiskForAi(52.5)).toBe("52.5");
    expect(formatAptitudeTypeForAi("conductor")).toBe("コンダクター");
    expect(formatAptitudeTypeForAi("pioneer")).toBe("パイオニア");
  });

  it("リスク 7 項目のラベルが RISK_DEFINITIONS[].aiLabel、資質は表示名、16 尺度は尺度名", () => {
    const template = RECRUITMENT_V1.userTemplate;
    for (const d of RISK_DEFINITIONS) expect(template).toContain(`${d.aiLabel}:{{risk.${d.key}}}`);
    for (const d of APTITUDE_DEFINITIONS) {
      expect(template).toContain(`${d.label}:{{aptitude.${d.key}}}`);
    }
    for (const d of TRAIT_DEFINITIONS) expect(template).toContain(`${d.label}:{{trait.${d.key}}}`);
  });

  it("buildAiAnalysisInput: 氏名の trim と職業の表示名", () => {
    const score = scoreAnswers(cyclicAnswers());
    const input = buildAiAnalysisInput({ respondentName: " 山田 太郎 ", occupationCode: 6, score });
    expect(input.respondentName).toBe("山田 太郎");
    expect(input.occupationLabel).toBe("受付");
    expect(input.result).toBe(score);
    expect(() => buildAiAnalysisInput({ respondentName: "a", occupationCode: 99, score })).toThrow(
      RangeError,
    );
  });
});

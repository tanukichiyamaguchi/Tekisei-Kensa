// tests/fixtures/existing_results.json の日本語キーを 00 の識別子に写す（03 §10.7、08 §3.6）。
// 検証用データの表示表記「感性解放型」→ sensory_open の写像はこのファイルにだけ置く（08 D08-04）。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type {
  AptitudeKey,
  AptitudeScores,
  CompatibilityScores,
  RiskScores,
  SocialStyleKey,
  SocialStyleScores,
  TraitScores,
} from "@/lib/scoring/types";

const TRAIT_MAP = {
  協力性: "cooperativeness",
  適応力: "adaptability",
  優劣性: "deliberateness",
  謙虚さ: "humility",
  反省力: "reflectiveness",
  規則遵守力: "rule_compliance",
  こだわり: "persistence",
  感情の豊かさ: "emotionality",
  敏感さ: "sensitivity",
  自己肯定感: "self_esteem",
  革新的思考: "innovativeness",
  行動力: "activeness",
  前向きさ: "positiveness",
  リーダーシップ: "leadership",
  発想力: "creativity",
  コミュニケーション力: "communication",
} as const;

const COMPAT_MAP = {
  適応する環境: "adaptive_environment",
  適応する業務: "adaptive_work",
  思考の傾向: "thinking_tendency",
  意思決定: "decision_making",
  ストレス耐性: "stress_tolerance",
} as const;

/** 資質 4 値のキー（内部名）と、候補フィールドの表示表記の両方を写す */
const APTITUDE_MAP: Readonly<Record<string, AptitudeKey>> = {
  感性開放型: "sensory_open",
  感性解放型: "sensory_open",
  環境受容型: "environment_receptive",
  自己実現型: "self_actualizing",
  探求論理型: "inquiry_logical",
};

const RISK_MAP = {
  不祥事が発生するリスク: "misconduct",
  苦情を強く主張するリスク: "complaint",
  メンタル面の不服が起こるリスク: "mental_distress",
  不注意からミスが発生するリスク: "careless_mistake",
  退職時におけるトラブル発生のリスク: "resignation_trouble",
  コミュニケーションが課題となり業務に支障が出るリスク: "communication_issue",
  モチベーションの不足により就業自体に繋がるリスク: "low_motivation",
} as const;

const STYLE_MAP: Readonly<Record<string, SocialStyleKey>> = {
  Driving: "driving",
  Expressive: "expressive",
  Analytical: "analytical",
  Amiable: "amiable",
};

type Raw = Record<string, unknown>;

function mapKeys<T>(src: unknown, map: Readonly<Record<string, string>>, where: string): T {
  const obj = src as Record<string, number>;
  const out: Record<string, number> = {};
  const expected = new Set(Object.values(map));
  for (const [ja, value] of Object.entries(obj)) {
    const key = map[ja];
    if (key === undefined) throw new Error(`${where}: 未知のキー ${ja}`);
    if (typeof value !== "number") throw new Error(`${where}.${ja} が数値ではない`);
    out[key] = value;
  }
  if (Object.keys(out).length !== expected.size) throw new Error(`${where}: キー数が不足`);
  return out as T;
}

function mapOne<T extends string>(
  value: unknown,
  map: Readonly<Record<string, T>>,
  where: string,
): T {
  const key = typeof value === "string" ? map[value] : undefined;
  if (key === undefined) throw new Error(`${where}: 写像できない値 ${String(value)}`);
  return key;
}

export interface FixtureRecord {
  readonly id: string;
  readonly traits: TraitScores;
  readonly compatibility: CompatibilityScores;
  readonly aptitudes: AptitudeScores;
  readonly risks: RiskScores;
  readonly socialStyles: SocialStyleScores;
  readonly reliability: number;
  readonly aptitudeTypeLabel: string;
  readonly aptitudeFirst: AptitudeKey;
  readonly aptitudeSecond: AptitudeKey;
  readonly socialStyle: SocialStyleKey;
  readonly isExcluded: boolean | null;
  readonly isCurrentLogic: boolean;
}

export interface FixtureSample {
  readonly subjectId: string;
  readonly radarTraits: TraitScores;
  readonly radarAptitudes: AptitudeScores;
  readonly radarSocialStyles: SocialStyleScores;
  readonly comparison: {
    readonly traitDiffs: TraitScores;
    readonly compatibilityAverages: CompatibilityScores;
    readonly axisDeviations: CompatibilityScores;
    readonly matchScore: number;
    readonly deviationScore: number;
    readonly grade: string;
  };
}

export interface Fixture {
  readonly records: readonly FixtureRecord[];
  readonly sample: FixtureSample;
}

function valuesOf(src: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(src as Record<string, { 値: number }>)) out[k] = v.値;
  return out;
}

export function loadFixture(): Fixture {
  const file = fileURLToPath(new URL("../../fixtures/existing_results.json", import.meta.url));
  const data = JSON.parse(readFileSync(file, "utf8")) as { records: Raw[]; sample: Raw };
  const records = data.records.map((r): FixtureRecord => {
    const id = String(r.id);
    return {
      id,
      traits: mapKeys(r["性格特性16"], TRAIT_MAP, `${id}.性格特性16`),
      compatibility: mapKeys(r["相性5"], COMPAT_MAP, `${id}.相性5`),
      aptitudes: mapKeys(r["資質4"], APTITUDE_MAP, `${id}.資質4`),
      risks: mapKeys(r["リスク7"], RISK_MAP, `${id}.リスク7`),
      socialStyles: mapKeys(r["ソーシャルスタイル4"], STYLE_MAP, `${id}.ソーシャルスタイル4`),
      reliability: r["信頼係数"] as number,
      aptitudeTypeLabel: String(r["タイプ"]),
      aptitudeFirst: mapOne(r["資質第一候補"], APTITUDE_MAP, `${id}.資質第一候補`),
      aptitudeSecond: mapOne(r["資質第二候補"], APTITUDE_MAP, `${id}.資質第二候補`),
      socialStyle: mapOne(r["ソーシャルスタイル"], STYLE_MAP, `${id}.ソーシャルスタイル`),
      isExcluded: r["除外"] as boolean | null,
      isCurrentLogic: r["現行ロジック整合"] === true,
    };
  });
  const s = data.sample;
  const c = s["比較計算値（組織全体）"] as Raw;
  const sample: FixtureSample = {
    subjectId: String(s["受検者"]),
    radarTraits: mapKeys(s["レーダーチャート個別特性"], TRAIT_MAP, "sample.レーダー"),
    radarAptitudes: mapKeys(valuesOf(s["資質バランス"]), APTITUDE_MAP, "sample.資質バランス"),
    radarSocialStyles: mapKeys(valuesOf(s["ソーシャルスタイル"]), STYLE_MAP, "sample.スタイル"),
    comparison: {
      traitDiffs: mapKeys(c["16尺度の差分（絶対値）"], TRAIT_MAP, "sample.差分"),
      compatibilityAverages: mapKeys(c["相性5軸の組織平均"], COMPAT_MAP, "sample.相性平均"),
      axisDeviations: mapKeys(c["相性5軸の偏差値（各軸）"], COMPAT_MAP, "sample.偏差"),
      matchScore: c["合致度"] as number,
      deviationScore: c["偏差値"] as number,
      grade: String(c["評価"]),
    },
  };
  return { records, sample };
}

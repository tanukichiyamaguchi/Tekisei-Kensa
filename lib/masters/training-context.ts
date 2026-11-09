// 育成・定着の AI 解説の「現場の状況を入力（8項目）」のマスタ（11-6 §2.5.3・§3.7.4）。
// 純粋なモジュールに保つ（Zod を読まない）。検証のスキーマ trainingContextSchema は lib/db/schemas/training-context.ts

/** 画面の並び（1 行目 4 つ、2 行目 4 つ）。入力文の並びも同じ */
export const TRAINING_CONTEXT_KEYS = [
  "tenure",
  "evaluation",
  "expectedRole",
  "recentState",
  "relationship",
  "wish",
  "changeSinceJoining",
  "concern",
] as const;
export type TrainingContextKey = (typeof TRAINING_CONTEXT_KEYS)[number];

export interface TrainingContextOption {
  readonly code: string; // アプリで付けたコード（参照元の値の内部名は使わない）
  readonly label: string; // 表示名
}

export interface TrainingContextItem {
  readonly label: string; // 「勤続年数」など
  readonly options: readonly TrainingContextOption[]; // 選択肢（上から。参照元定義のオプションセットの並び）
}

export const TRAINING_CONTEXT_ITEMS: Readonly<Record<TrainingContextKey, TrainingContextItem>> =
  Object.freeze({
    tenure: {
      label: "勤続年数",
      options: [
        { code: "under_1y", label: "入職1年未満" },
        { code: "year_2", label: "2年目" },
        { code: "years_3_5", label: "3年~5年" }, // 「~」は半角
        { code: "year_6_plus", label: "6年目以上" },
      ],
    },
    evaluation: {
      label: "現在の評価",
      options: [
        { code: "above", label: "期待以上" },
        { code: "meets", label: "期待どおり" },
        { code: "growing", label: "もう少し伸びてほしい" },
        { code: "issues", label: "課題が多い" },
      ],
    },
    expectedRole: {
      label: "今後期待する役割",
      options: [
        { code: "leader", label: "リーダー" },
        { code: "chief", label: "チーフ" },
        { code: "project_leader", label: "プロジェクトリーダー" },
        { code: "job_leader", label: "職種リーダー" },
        { code: "trainer", label: "新人教育・指導担当" },
        { code: "stock_equipment", label: "在庫・機材管理担当" },
        { code: "keep_current", label: "現在の役割を継続" },
      ],
    },
    recentState: {
      label: "最近の様子",
      options: [
        { code: "motivated", label: "意欲的になっている" },
        { code: "stable", label: "安定している" },
        { code: "low_energy", label: "以前より元気がない" },
        { code: "complaining", label: "不満をこぼしている" },
      ],
    },
    relationship: {
      label: "他スタッフとの関係",
      options: [
        { code: "good", label: "良好" },
        { code: "specific_mismatch", label: "特定の人と合わない" },
        { code: "isolated", label: "孤立気味" },
        { code: "unknown", label: "把握していない" },
      ],
    },
    wish: {
      label: "本人の希望",
      options: [
        { code: "skill_up", label: "スキルアップしたい" },
        { code: "expand_role", label: "役割を広げたい" },
        { code: "keep_status", label: "現状維持" },
        { code: "reduce_load", label: "負担を減らしたい" },
        { code: "unknown", label: "把握していない" },
      ],
    },
    changeSinceJoining: {
      label: "入職時と比べた変化",
      options: [
        { code: "growing", label: "成長している" },
        { code: "unchanged", label: "変わらない" },
        { code: "less_proactive", label: "以前より消極的になった" },
      ],
    },
    concern: {
      label: "気になっていること",
      options: [
        { code: "few_reports", label: "報告が少ない" },
        { code: "many_mistakes", label: "ミスが多い" },
        { code: "stalled", label: "成長が止まっている" },
        { code: "late_absent", label: "遅刻・欠勤が増えた" },
        { code: "none", label: "特にない" },
      ],
    },
  });

/** 8 項目の値（各項目の options の code）。results.trainingContext・aiAnalyses.trainingContext の形 */
export type TrainingContext = { readonly [K in TrainingContextKey]: string };

/** 項目のコード → 表示名。未知のコードは RangeError */
export function trainingContextLabel(key: TrainingContextKey, code: string): string {
  const option = TRAINING_CONTEXT_ITEMS[key].options.find((o) => o.code === code);
  if (option === undefined) throw new RangeError(`未知のコードです: ${key} = ${code}`);
  return option.label;
}

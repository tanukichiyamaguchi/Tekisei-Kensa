// 比較結果の表示用の整形（06 §4.4、§3.5.3、11-4 §2.6・§2.7.2・§2.11）。純関数。
// 偏差値の表示（SHOW_DEVIATION_SCORE）と母集団の注記（populationNote）は PR-7.8a で消した（偏差値・人数の補足行・注記は出さない。
// K-39 Q-26・Q-27）。立ち位置の文は、ブラウザに文言マスタの全体を送らないよう、索引（lib/masters/texts）でなく立ち位置のモジュールから読む
import { ADMIN_TEXTS } from "./admin-texts";
import { teamLabel } from "./comparison-scope-params";
import { positionLines } from "./result-detail-rules";
import { POSITION_DEFINITIONS } from "@/lib/masters/texts/positions";
import type { ComparisonResult, ComparisonScope, PositionKey } from "@/lib/scoring/types";

export interface PositionView {
  readonly key: PositionKey;
  readonly label: string;
  readonly descriptionLines: readonly string[]; // PositionDefinition.description を改行で分け、各行の先頭の「・」を除いたもの
  readonly imagePath: string; // /images/positions/{key}.svg（06 §7）
}

/** 「組織全体」「Aチーム」 */
export function formatScopeLabel(scope: ComparisonScope): string {
  return scope.kind === "organization" ? ADMIN_TEXTS.organizationScope : teamLabel(scope.teamCode);
}

/** 「比較対象: 組織全体（12 名）」（ダウンロードのポップアップが使う間だけ残す。11-5 の PR-7.12 で消す） */
export function formatPopulationLabel(scope: ComparisonScope, populationSize: number): string {
  return `比較対象: ${formatScopeLabel(scope)}（${populationSize} 名）`;
}

/** 組織内のポジション（11-4 §2.7.2 は名前と説明の 1 行目、§2.11 は名前と説明の全行。各行の先頭の「・」は出さない） */
export function toPositionView(comparison: Pick<ComparisonResult, "position">): PositionView {
  const def = POSITION_DEFINITIONS[comparison.position];
  return Object.freeze({
    key: def.key,
    label: def.label,
    descriptionLines: positionLines(def.description),
    imagePath: `/images/positions/${def.key}.svg`,
  });
}

// 比較結果の表示用の整形（06 §4.4、§3.5.3）。純関数
import { ADMIN_TEXTS } from "./admin-texts";
import { teamLabel } from "./comparison-scope-params";
import { POSITION_DEFINITIONS } from "@/lib/masters/texts";
import type { ComparisonResult, ComparisonScope, PositionKey } from "@/lib/scoring/types";

export interface PositionView {
  readonly key: PositionKey;
  readonly label: string;
  readonly descriptionLines: readonly string[]; // PositionDefinition.description を改行で分割
  readonly imagePath: string; // /images/positions/{key}.svg（06 §7）
}

/** 「組織全体」「Aチーム」 */
export function formatScopeLabel(scope: ComparisonScope): string {
  return scope.kind === "organization" ? ADMIN_TEXTS.organizationScope : teamLabel(scope.teamCode);
}

/** 「比較対象: 組織全体（12 名）」 */
export function formatPopulationLabel(scope: ComparisonScope, populationSize: number): string {
  return `比較対象: ${formatScopeLabel(scope)}（${populationSize} 名）`;
}

export function toPositionView(comparison: Pick<ComparisonResult, "position">): PositionView {
  const def = POSITION_DEFINITIONS[comparison.position];
  return Object.freeze({
    key: def.key,
    label: def.label,
    descriptionLines: Object.freeze(def.description.split("\n")),
    imagePath: `/images/positions/${def.key}.svg`,
  });
}

/**
 * 母集団人数と本人の包含に応じた注記（06 §3.5.3 の表）。不要なら null。
 * 0 件は 409 POPULATION_EMPTY（T-10）として別に扱うため、ここでは null を返す
 */
export function populationNote(populationSize: number, includesSubject: boolean): string | null {
  if (populationSize <= 0) return null;
  if (populationSize === 1) {
    return includesSubject ? ADMIN_TEXTS.populationSubjectOnly : ADMIN_TEXTS.populationSingleOther;
  }
  return includesSubject ? null : ADMIN_TEXTS.subjectNotInPopulation;
}

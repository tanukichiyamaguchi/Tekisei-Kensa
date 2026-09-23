// 比較範囲の URL 変換（06 §10.2）
import type { ComparisonScope, TeamCode } from "@/lib/scoring/types";

const TEAM_CODE_PATTERN = /^[A-Z]$/;

export const TEAM_CODES: readonly TeamCode[] = Object.freeze([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
] as TeamCode[]);

function isTeamCode(value: string | undefined): value is TeamCode {
  return value !== undefined && TEAM_CODE_PATTERN.test(value);
}

/** URL クエリ → ComparisonScope。無効なら null（未選択） */
export function parseComparisonScope(params: {
  readonly scope?: string | undefined;
  readonly teamCode?: string | undefined;
}): ComparisonScope | null {
  if (params.scope === "organization") return { kind: "organization" };
  if (params.scope === "team" && isTeamCode(params.teamCode)) {
    return { kind: "team", teamCode: params.teamCode };
  }
  return null;
}

/** ComparisonScope → URL クエリ文字列（先頭の ? なし） */
export function toComparisonQuery(scope: ComparisonScope | null): string {
  if (scope === null) return "";
  return scope.kind === "organization"
    ? "scope=organization"
    : `scope=team&teamCode=${scope.teamCode}`;
}

/** プルダウンの value（"" | "organization" | "team:A"） */
export function toSelectValue(scope: ComparisonScope | null): string {
  if (scope === null) return "";
  return scope.kind === "organization" ? "organization" : `team:${scope.teamCode}`;
}

export function fromSelectValue(value: string): ComparisonScope | null {
  if (value === "organization") return { kind: "organization" };
  const match = /^team:(.+)$/.exec(value);
  return match ? parseComparisonScope({ scope: "team", teamCode: match[1] }) : null;
}

/** 要件定義書 §6.2 A-03 */
export function teamLabel(code: TeamCode): string {
  return `${code}チーム`;
}

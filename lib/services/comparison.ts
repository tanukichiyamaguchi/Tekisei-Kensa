// 比較計算（04 §5.5）。保存せず呼び出しごとに計算する（要件定義書 §11 の 6 番）。母集団の条件は 02 の fetchPopulation() 1 か所
import { writeAuditLog } from "./audit";
import type { ComparisonDto } from "./dto/result";
import { ApiError } from "./errors";
import { loadVisibleResult } from "./result-detail";
import type { AdminContext } from "@/lib/auth/admin-context";
import { COLLECTIONS } from "@/lib/db/collections";
import { fetchPopulation } from "@/lib/db/repositories/results-repository";
import { compareWithPopulation } from "@/lib/scoring/compare";
import { EmptyPopulationError } from "@/lib/scoring/errors";
import type { ComparisonResult, ComparisonScope } from "@/lib/scoring/types";
import { SCORING_VERSION } from "@/lib/scoring/version";

function populationEmpty(scope: ComparisonScope): ApiError {
  return new ApiError(
    409,
    "POPULATION_EMPTY",
    "比較対象となる受検者がいません",
    scope.kind === "team" ? { scope: "team", teamCode: scope.teamCode } : { scope: "organization" },
  );
}

export async function getComparison(
  ctx: AdminContext,
  input: { readonly resultId: string; readonly scope: ComparisonScope },
  now: Date = new Date(),
): Promise<ComparisonDto> {
  // 1. 対象（見えなければ 404）
  const result = await loadVisibleResult(ctx, input.resultId);
  // 2. 母集団（admin が呼んでも幹部を含める。10 K-01）
  const population = await fetchPopulation({
    organizationId: ctx.organizationId,
    scope: input.scope,
  });
  // 3〜5. 本人が母集団に含まれるか、比較
  const includesSubject = population.some((r) => r.resultId === result.id);
  let comparison: ComparisonResult;
  try {
    comparison = compareWithPopulation(
      { traits: result.traits, compatibility: result.compatibility },
      population,
      input.scope,
    );
  } catch (error) {
    if (error instanceof EmptyPopulationError) throw populationEmpty(input.scope);
    throw error;
  }
  // 6. 閲覧の監査ログ
  await writeAuditLog({
    organizationId: ctx.organizationId,
    actorKind: "admin",
    actorUid: ctx.uid,
    actorRole: ctx.role,
    action: "result.comparison",
    targetCollection: COLLECTIONS.results,
    targetId: result.id,
    details: {
      scope: input.scope.kind,
      teamCode: input.scope.kind === "team" ? input.scope.teamCode : null,
      populationSize: comparison.populationSize,
    },
    request: ctx.request,
  });
  // 7. 丸めずにそのまま返す（03 §9）
  return {
    ...comparison,
    resultId: result.id,
    scoringVersion: SCORING_VERSION,
    includesSubject,
    computedAt: now.toISOString(),
  };
}

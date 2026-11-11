"use client";
// 比較組織プルダウン（06 §3.5.1、11-4 §2.3.2）。選択で URL クエリだけを書き換え（router.replace。履歴を増やさない）、取得は ComparisonProvider が行う。
// 見えるラベルは付けない（参照元どおり。読み上げの名前は aria-label「比較組織」）。見た目は CSS の #rd-head .rd-scope（幅 180px・高さ 44px・
// 枠と焦点の枠の色は K-50。別表D の 2）。印刷の形は ResultHead が動かない箱で描く（11-4 §2.18）
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useComparison } from "./ComparisonProvider";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import {
  TEAM_CODES,
  fromSelectValue,
  parseComparisonScope,
  teamLabel,
  toComparisonQuery,
  toSelectValue,
} from "@/lib/presentation/comparison-scope-params";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";

export function ComparisonScopeSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useComparison();
  const scope = parseComparisonScope({
    scope: searchParams.get("scope") ?? undefined,
    teamCode: searchParams.get("teamCode") ?? undefined,
  });
  const loading = state.kind === "loading";
  return (
    <select
      className="rd-scope"
      aria-label={RESULT_DETAIL_TEXTS.scopeSelect}
      value={toSelectValue(scope)}
      aria-disabled={loading ? "true" : undefined}
      onChange={(e) => {
        if (loading) return;
        const query = toComparisonQuery(fromSelectValue(e.target.value));
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      }}
    >
      <option value="">{RESULT_DETAIL_TEXTS.selectComparison}</option>
      <option value="organization">{ADMIN_TEXTS.organizationScope}</option>
      {TEAM_CODES.map((code) => (
        <option key={code} value={`team:${code}`}>
          {teamLabel(code)}
        </option>
      ))}
    </select>
  );
}

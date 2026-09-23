"use client";
// 比較組織プルダウン（06 §3.5.1）。選択で URL クエリだけを書き換え（router.replace。履歴を増やさない）、取得は ComparisonProvider が行う
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
    <div className="field field--inline">
      <label className="field__label" htmlFor="comparison-scope">
        比較組織
      </label>
      <select
        id="comparison-scope"
        value={toSelectValue(scope)}
        aria-disabled={loading ? "true" : undefined}
        onChange={(e) => {
          if (loading) return;
          const query = toComparisonQuery(fromSelectValue(e.target.value));
          router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
      >
        <option value="">{ADMIN_TEXTS.selectComparison}</option>
        <option value="organization">{ADMIN_TEXTS.organizationScope}</option>
        {TEAM_CODES.map((code) => (
          <option key={code} value={`team:${code}`}>
            {teamLabel(code)}
          </option>
        ))}
      </select>
    </div>
  );
}

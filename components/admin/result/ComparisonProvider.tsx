"use client";
// 比較状態（06 §3.5.1）。URL クエリの scope・teamCode を読み、GET …/comparison を 1 本呼んで配下に渡す。
// 応答は React の state にだけ置く（Cookie・localStorage・Firestore に保存しない。要件定義書 §11 の 6 番）
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { useToast } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { parseComparisonScope } from "@/lib/presentation/comparison-scope-params";
import type { ComparisonScope } from "@/lib/scoring/types";
import type { ComparisonDto } from "@/lib/services/dto/result";
import { AdminApiError, fetchComparison } from "@/lib/utils/admin-api";

export type ComparisonState =
  | { readonly kind: "none" } // 比較未選択（scope なし・無効）
  | { readonly kind: "loading"; readonly scope: ComparisonScope }
  | { readonly kind: "ready"; readonly scope: ComparisonScope; readonly comparison: ComparisonDto }
  | { readonly kind: "empty"; readonly scope: ComparisonScope } // 409 POPULATION_EMPTY（§3.5.3）
  | { readonly kind: "error"; readonly scope: ComparisonScope; readonly message: string };

const ComparisonContext = createContext<ComparisonState>({ kind: "none" });

export function useComparison(): ComparisonState {
  return useContext(ComparisonContext);
}

/** 比較に依存する値（ready のときだけ） */
export function useReadyComparison(): ComparisonDto | null {
  const state = useComparison();
  return state.kind === "ready" ? state.comparison : null;
}

function scopeKey(scope: ComparisonScope | null): string {
  if (scope === null) return "";
  return scope.kind === "organization" ? "organization" : `team:${scope.teamCode}`;
}

export interface ComparisonProviderProps {
  readonly resultId: string;
  /** 印刷用ページ（07）専用。指定時は API を呼ばない */
  readonly initialComparison?: ComparisonDto | null;
  readonly children: ReactNode;
}

export function ComparisonProvider(props: ComparisonProviderProps) {
  if (props.initialComparison !== undefined) {
    const state: ComparisonState = props.initialComparison
      ? {
          kind: "ready",
          scope: props.initialComparison.scope,
          comparison: props.initialComparison,
        }
      : { kind: "none" };
    return <ComparisonContext.Provider value={state}>{props.children}</ComparisonContext.Provider>;
  }
  return (
    <FetchingComparisonProvider resultId={props.resultId}>
      {props.children}
    </FetchingComparisonProvider>
  );
}

function FetchingComparisonProvider(props: {
  readonly resultId: string;
  readonly children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const rawScope = searchParams.get("scope");
  const scope = parseComparisonScope({
    scope: rawScope ?? undefined,
    teamCode: searchParams.get("teamCode") ?? undefined,
  });
  const key = scopeKey(scope);
  const [state, setState] = useState<ComparisonState>({ kind: "none" });

  // 無効なクエリは未選択として扱い、クエリを除去する（API は呼ばない）
  useEffect(() => {
    if (rawScope !== null && scope === null) router.replace(pathname, { scroll: false });
  }, [rawScope, scope, router, pathname]);

  useEffect(() => {
    if (scope === null) {
      setState({ kind: "none" });
      return;
    }
    const controller = new AbortController();
    setState({ kind: "loading", scope });
    fetchComparison(props.resultId, scope, controller.signal)
      .then((comparison) => {
        if (!controller.signal.aborted) setState({ kind: "ready", scope, comparison });
      })
      .catch((error: unknown) => {
        // 連続変更時は最後の選択だけを反映する（前の応答は捨てる）
        if (controller.signal.aborted) return;
        if (error instanceof AdminApiError && error.code === "POPULATION_EMPTY") {
          setState({ kind: "empty", scope });
        } else if (error instanceof AdminApiError && error.code === "RESULT_NOT_FOUND") {
          toast.show(error.message, "error");
          setState({ kind: "none" });
        } else {
          const message = error instanceof AdminApiError ? error.message : ADMIN_TEXTS.networkError;
          toast.show(message, "error");
          setState({ kind: "error", scope, message });
        }
      });
    return () => controller.abort();
    // scope は key から一意に決まるため key だけを依存にする
    // （scope オブジェクトは描画ごとに作り直される）
  }, [key, props.resultId]);

  return <ComparisonContext.Provider value={state}>{props.children}</ComparisonContext.Provider>;
}

"use client";
// M-04 回答一覧の本文（06 §3.4）。初期データは Server Component が lib/services から取得して渡す
import Link from "next/link";
import { useState } from "react";

import { ResultFilters } from "./ResultFilters";
import { ResultTable } from "./ResultTable";
import {
  hasResultFilters,
  pageCount,
  resultListHref,
  type ResultListUrlState,
} from "@/lib/presentation/admin-navigation";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import type { PagedDto, ResultListItemDto } from "@/lib/services/dto/admin";

export function ResultsView(props: {
  readonly data: PagedDto<ResultListItemDto>;
  readonly state: ResultListUrlState;
  readonly canViewExecutives: boolean;
}) {
  const [total, setTotal] = useState(props.data.total);
  const pages = pageCount(total, props.data.pageSize);
  const filtered = hasResultFilters(props.state);

  return (
    <>
      <h1>{ADMIN_TEXTS.nav.results}</h1>
      <div className="panel">
        <ResultFilters
          state={props.state}
          total={total}
          canViewExecutives={props.canViewExecutives}
        />
        {props.data.items.length === 0 ? (
          <div className="empty-state">
            {filtered || total > 0 ? (
              <p>{ADMIN_TEXTS.noMatchingResults}</p>
            ) : (
              <>
                <p>{ADMIN_TEXTS.noResults}</p>
                <Link href="/admin/account">アカウント画面へ</Link>
              </>
            )}
          </div>
        ) : (
          <ResultTable
            items={props.data.items}
            showKind={props.canViewExecutives}
            onDeleted={() => setTotal((t) => Math.max(0, t - 1))}
          />
        )}
        {pages > 1 ? (
          <nav className="pager" aria-label="ページ">
            {props.data.page > 1 ? (
              <Link href={resultListHref({ ...props.state, page: props.data.page - 1 })}>
                ‹ 前へ
              </Link>
            ) : null}
            {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
              <Link
                key={p}
                href={resultListHref({ ...props.state, page: p })}
                aria-current={p === props.data.page ? "page" : undefined}
              >
                {p}
              </Link>
            ))}
            {props.data.page < pages ? (
              <Link href={resultListHref({ ...props.state, page: props.data.page + 1 })}>
                次へ ›
              </Link>
            ) : null}
            <span>1 ページ {props.data.pageSize} 件</span>
          </nav>
        ) : null}
      </div>
    </>
  );
}

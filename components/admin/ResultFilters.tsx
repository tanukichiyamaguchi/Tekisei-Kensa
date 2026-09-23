"use client";
// M-04 の検索・絞り込み・並び替え（06 §3.4.3）。状態は URL クエリに持ち、サーバ側で絞り込む
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { resultListHref, type ResultListUrlState } from "@/lib/presentation/admin-navigation";
import { RESPONDENT_KIND_LABELS } from "@/lib/presentation/admin-texts";
import { TEAM_CODES, teamLabel } from "@/lib/presentation/comparison-scope-params";

const SORT_OPTIONS = [
  { value: "submittedAt:desc", label: "回答日時（新しい順）" },
  { value: "submittedAt:asc", label: "回答日時（古い順）" },
  { value: "name:asc", label: "氏名（昇順）" },
  { value: "name:desc", label: "氏名（降順）" },
] as const;

export function ResultFilters(props: {
  readonly state: ResultListUrlState;
  readonly total: number;
  readonly canViewExecutives: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState(props.state.q ?? "");
  const go = (patch: Partial<ResultListUrlState>) =>
    router.push(resultListHref({ ...props.state, ...patch, page: 1 }));
  const sortValue = `${props.state.sort}:${props.state.order ?? (props.state.sort === "submittedAt" ? "desc" : "asc")}`;

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = q.trim();
    go({ q: trimmed === "" ? undefined : trimmed });
  }

  return (
    <div className="result-filters">
      <form className="field result-filters__search" role="search" onSubmit={onSearch}>
        <label className="field__label" htmlFor="result-search">
          氏名・電話番号で検索
        </label>
        <div className="field__row">
          <input
            id="result-search"
            className="field__input"
            type="search"
            maxLength={100}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="btn">
            検索
          </button>
        </div>
      </form>
      {props.canViewExecutives ? (
        <div className="field">
          <label className="field__label" htmlFor="result-kind">
            区分
          </label>
          <select
            id="result-kind"
            value={props.state.kind ?? ""}
            onChange={(e) =>
              go({
                kind:
                  e.target.value === ""
                    ? undefined
                    : (e.target.value as NonNullable<ResultListUrlState["kind"]>),
              })
            }
          >
            <option value="">すべて</option>
            <option value="applicant">{RESPONDENT_KIND_LABELS.applicant}</option>
            <option value="executive">{RESPONDENT_KIND_LABELS.executive}</option>
          </select>
        </div>
      ) : null}
      <div className="field">
        <label className="field__label" htmlFor="result-team">
          チーム
        </label>
        <select
          id="result-team"
          value={props.state.teamCode ?? ""}
          onChange={(e) =>
            go({
              teamCode:
                e.target.value === ""
                  ? undefined
                  : (e.target.value as NonNullable<ResultListUrlState["teamCode"]>),
            })
          }
        >
          <option value="">すべて</option>
          <option value="none">未設定</option>
          {TEAM_CODES.map((code) => (
            <option key={code} value={code}>
              {teamLabel(code)}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field__label" htmlFor="result-sort">
          並び替え
        </label>
        <select
          id="result-sort"
          value={sortValue}
          onChange={(e) => {
            const [sort, order] = e.target.value.split(":") as [
              ResultListUrlState["sort"],
              NonNullable<ResultListUrlState["order"]>,
            ];
            go({ sort, order });
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="result-filters__total" aria-live="polite">
        全 {props.total} 件
      </p>
    </div>
  );
}

"use client";
// 道具の行（11-2 §2.6・§2.7）: 区分タブ → 検索欄 → チームで絞り込む → 並び順 → 件数（と「絞り込みを解除」）。
// 状態（区分・検索語・チーム・並び順）は ResultsView が持ち、表示の上限と sessionStorage の保存も ResultsView が行う（§2.21）。
// 検索欄は入力のたびに onSearchInput を呼び、検索語を当てるのは最後の入力から 150 ミリ秒後（ResultsView）
import { useId } from "react";

import { SearchIcon } from "./icons";
import { teamLabel } from "@/lib/presentation/comparison-scope-params";
import {
  hasActiveFilters,
  type ListFilterState,
  type ListSegment,
  type ListSort,
  type ListStats,
} from "@/lib/presentation/result-list-view";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";
import type { TeamCode } from "@/lib/scoring/types";

const BASE_SEGMENTS: readonly ListSegment[] = ["all", "cand", "exec", "left"];
const SORTS: readonly ListSort[] = ["new", "old", "name", "due"];

export function ListTools(props: {
  readonly filter: ListFilterState;
  /** 検索欄の文字（入力のたび。検索語 filter.q は 150 ミリ秒後に当たる） */
  readonly searchText: string;
  readonly stats: ListStats;
  /** チームで絞り込むの選択肢（全行の代表のチームに使われているチーム。A→Z） */
  readonly teamCodes: readonly TeamCode[];
  /** 表示対象の行数（表示の上限で切る前） */
  readonly shownCount: number;
  readonly onSegment: (seg: ListSegment) => void;
  readonly onSearchInput: (text: string) => void;
  readonly onTeam: (team: ListFilterState["team"]) => void;
  readonly onSort: (sort: ListSort) => void;
  readonly onClear: () => void;
}) {
  const texts = RESULT_LIST_TEXTS;
  const t = texts.tools;
  const searchId = useId();
  const teamId = useId();
  const sortId = useId();
  const s = props.stats;
  const counts: Readonly<Record<ListSegment, number>> = {
    all: s.rowCount,
    cand: s.candidateRows,
    exec: s.employedRows,
    left: s.leftRows,
    old: s.oneYearRows,
  };
  // 5 番目の「受験から1年以上」は、区分がそれの間だけ出す（§2.6）
  const segments: readonly ListSegment[] =
    props.filter.seg === "old" ? [...BASE_SEGMENTS, "old"] : BASE_SEGMENTS;
  return (
    <div className="rl-tools">
      <div className="rl-tabs" role="tablist" aria-label={texts.segmentsLabel}>
        {segments.map((seg) => (
          <button
            key={seg}
            type="button"
            role="tab"
            aria-selected={props.filter.seg === seg}
            className="rl-tab"
            onClick={() => props.onSegment(seg)}
          >
            {texts.segments[seg]}
            <span className="rl-tab__count">{counts[seg]}</span>
          </button>
        ))}
      </div>
      <div className="rl-search">
        <SearchIcon />
        <label className="visually-hidden" htmlFor={searchId}>
          {t.search}
        </label>
        <input
          id={searchId}
          className="rl-search__input"
          type="search"
          placeholder={t.search}
          value={props.searchText}
          onChange={(event) => props.onSearchInput(event.target.value)}
        />
      </div>
      <label className="visually-hidden" htmlFor={teamId}>
        {t.teamFilter}
      </label>
      <select
        id={teamId}
        className="rl-select"
        value={props.filter.team}
        onChange={(event) => props.onTeam(event.target.value as ListFilterState["team"])}
      >
        <option value="">{t.teamAll}</option>
        <option value="none">{texts.teamUnassigned}</option>
        {props.teamCodes.map((code) => (
          <option key={code} value={code}>
            {teamLabel(code)}
          </option>
        ))}
      </select>
      <label className="visually-hidden" htmlFor={sortId}>
        {t.sort}
      </label>
      <select
        id={sortId}
        className="rl-select"
        value={props.filter.sort}
        onChange={(event) => props.onSort(event.target.value as ListSort)}
      >
        {SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {texts.sorts[sort]}
          </option>
        ))}
      </select>
      <div className="rl-count">
        {t.shownCount(props.shownCount)}
        {hasActiveFilters(props.filter) ? (
          <>
            {t.separator}
            <button type="button" className="rl-clear" onClick={props.onClear}>
              {t.clearFilters}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

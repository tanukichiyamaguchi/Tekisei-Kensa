"use client";
// 回答一覧の表（11-2 §2.8〜§2.11）。1 行 = 同じ人の受験をまとめた行（値は代表の受験）。行の key は代表の resultId（読み直しても要素を
// 作り直さず、焦点を保つ。§2.23）。行を押すと代表の結果を開く（選択欄・ラベル・入力欄・ボタン・リンクの上では開かない）。
// 送信中の行は操作の要素を aria-disabled にし、変更を受け付けない（選択欄は制御の値のまま戻る）。
// data-testid="result-table" は E2E の目印。data-rl-menu-toggle はメニューの外を押して閉じたときに続く click を止める目印（§2.12）
import Link from "next/link";
import { useId, type MouseEvent } from "react";

import { DotsIcon, InfoIcon } from "./icons";
import { APTITUDE_TYPE_DEFINITIONS } from "@/lib/masters/indicators/aptitude-types";
import { TEAM_CODES, teamLabel } from "@/lib/presentation/comparison-scope-params";
import { formatHm, formatYmd } from "@/lib/presentation/format-datetime";
import { rowChips, typeDot, type ListChip } from "@/lib/presentation/result-list-view";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";
import type { TeamCode } from "@/lib/scoring/types";
import type { ResultListRowDto } from "@/lib/services/dto/admin";

const TYPE_BY_KEY = new Map(APTITUDE_TYPE_DEFINITIONS.map((d) => [d.key, d]));
/** 行を押しても結果を開かない場所（§2.8） */
const ROW_CLICK_IGNORED = "select, label, input, button, a";

/** 結果詳細の URL（§2.1） */
export function resultHref(resultId: string): string {
  return `/admin/results/${encodeURIComponent(resultId)}`;
}

/** 行の氏名（空なら「（氏名なし）」。§2.8）。リンク・読み上げ名・通知・ダイアログで使う */
export function personDisplayName(row: Pick<ResultListRowDto, "name">): string {
  return row.name === "" ? RESULT_LIST_TEXTS.table.noName : row.name;
}

export interface PersonRowsHandlers {
  readonly onOpenResult: (resultId: string) => void;
  readonly onTeamChange: (row: ResultListRowDto, team: "" | TeamCode) => void;
  readonly onExcludeToggle: (row: ResultListRowDto) => void;
  /** 区分チップ（押したチップを渡す。区分メニューの位置と、閉じたあとの焦点の戻り先） */
  readonly onOpenStatusMenu: (row: ResultListRowDto, anchor: HTMLElement) => void;
  /** ⋮（押したボタンを渡す） */
  readonly onOpenMoreMenu: (row: ResultListRowDto, anchor: HTMLElement) => void;
}

export function PersonRows(
  props: PersonRowsHandlers & {
    readonly rows: readonly ResultListRowDto[];
    /** 基準時刻（new Date(generatedAt)）。「受験から1年以上」のチップに使う */
    readonly now: Date;
    /** 送信中の行（代表の resultId） */
    readonly pending: ReadonlySet<string>;
  },
) {
  const t = RESULT_LIST_TEXTS.table;
  return (
    <table className="rl-table" data-testid="result-table">
      <thead>
        <tr>
          <th scope="col" className="rl-th rl-th--person">
            {t.person}
          </th>
          <th scope="col" className="rl-th">
            {t.type}
          </th>
          <th scope="col" className="rl-th">
            {t.latest}
          </th>
          <th scope="col" className="rl-th">
            {t.team}
          </th>
          <th scope="col" className="rl-th rl-th--help" title={t.excludedHelp}>
            {t.excluded} <InfoIcon />
          </th>
          <th scope="col" className="rl-th rl-th--actions">
            {t.actions}
          </th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <PersonRow
            key={row.resultId}
            row={row}
            now={props.now}
            busy={props.pending.has(row.resultId)}
            onOpenResult={props.onOpenResult}
            onTeamChange={props.onTeamChange}
            onExcludeToggle={props.onExcludeToggle}
            onOpenStatusMenu={props.onOpenStatusMenu}
            onOpenMoreMenu={props.onOpenMoreMenu}
          />
        ))}
      </tbody>
    </table>
  );
}

function PersonRow(
  props: PersonRowsHandlers & {
    readonly row: ResultListRowDto;
    readonly now: Date;
    readonly busy: boolean;
  },
) {
  const { row, busy } = props;
  const texts = RESULT_LIST_TEXTS;
  const statusId = useId();
  const moreId = useId();
  const teamId = useId();
  const name = personDisplayName(row);
  const href = resultHref(row.resultId);
  const type = TYPE_BY_KEY.get(row.aptitudeType);
  const dot = typeDot(row.aptitudeType);
  const previous = row.exams[1];
  const disabled = busy ? "true" : undefined;

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
    if (event.target instanceof Element && event.target.closest(ROW_CLICK_IGNORED)) return;
    props.onOpenResult(row.resultId);
  };

  const chip = (c: ListChip) => {
    switch (c.kind) {
      case "role":
        return (
          <span key={c.kind} className={`rl-chip rl-chip--${c.role}`}>
            {c.label}
          </span>
        );
      case "status":
        return (
          <button
            key={c.kind}
            type="button"
            id={statusId}
            className={`rl-chip rl-chip--status rl-chip--${c.status}`}
            title={texts.chips.statusTitle}
            aria-haspopup="menu"
            aria-disabled={disabled}
            onClick={(event) => {
              if (!busy) props.onOpenStatusMenu(row, event.currentTarget);
            }}
          >
            {c.label}
          </button>
        );
      case "hired":
      case "left":
        return (
          <span key={c.kind} className="rl-chip rl-chip--date">
            {c.label}
          </span>
        );
      case "nth":
        return (
          <span key={c.kind} className="rl-chip rl-chip--nth">
            {c.label}
          </span>
        );
      case "longitudinal":
        return (
          <span key={c.kind} className="rl-chip rl-chip--longitudinal">
            {c.label}
          </span>
        );
      case "one_year":
        return (
          <span key={c.kind} className="rl-chip rl-chip--one-year">
            {c.label}
          </span>
        );
      case "meta":
        return (
          <span key={c.kind} className="rl-meta">
            {c.label}
          </span>
        );
    }
  };

  return (
    <tr className="rl-row" onClick={onRowClick}>
      <td className="rl-td rl-td--person">
        <Link href={href} className="rl-name">
          {name}
        </Link>
        <div className="rl-chips">{rowChips(row, props.now).map(chip)}</div>
      </td>
      <td className="rl-td rl-td--type">
        {type ? (
          <span className="rl-type" title={dot.title ?? undefined}>
            <span className="rl-type__dot" style={{ background: dot.color }} />
            {type.shortLabel}
          </span>
        ) : (
          <span className="rl-type rl-type--none">{texts.table.noType}</span>
        )}
      </td>
      <td className="rl-td rl-td--latest">
        {formatYmd(row.submittedAt)}{" "}
        <span className="rl-latest__time">{formatHm(row.submittedAt)}</span>
        {previous ? (
          <span className="rl-latest__prev">
            {texts.table.previous(formatYmd(previous.submittedAt))}
          </span>
        ) : null}
      </td>
      <td className="rl-td rl-td--team">
        <label className="visually-hidden" htmlFor={teamId}>
          {texts.table.teamSelect(name)}
        </label>
        <select
          id={teamId}
          className="rl-team"
          data-empty={row.teamCode === null ? "true" : undefined}
          value={row.teamCode ?? ""}
          aria-disabled={disabled}
          onChange={(event) => {
            if (!busy) props.onTeamChange(row, event.target.value as "" | TeamCode);
          }}
        >
          <option value="">{texts.teamUnassigned}</option>
          {TEAM_CODES.map((code) => (
            <option key={code} value={code}>
              {teamLabel(code)}
            </option>
          ))}
        </select>
      </td>
      <td className="rl-td rl-td--excl">
        <button
          type="button"
          role="switch"
          aria-checked={row.isExcluded}
          aria-label={texts.table.excludeSwitch(name)}
          aria-disabled={disabled}
          className="rl-switch"
          onClick={() => {
            if (!busy) props.onExcludeToggle(row);
          }}
        >
          <span className="rl-switch__track" aria-hidden="true">
            <span className="rl-switch__knob" />
          </span>
          <span className="rl-switch__label">
            {row.isExcluded ? texts.table.excludedOn : texts.table.excludedOff}
          </span>
        </button>
      </td>
      <td className="rl-td rl-td--actions">
        <div className="rl-actions">
          <Link href={href} className="rl-open">
            {texts.table.openResult}
          </Link>
          <button
            type="button"
            id={moreId}
            className="rl-more"
            aria-label={texts.table.moreActions(name)}
            title={texts.table.moreActionsTitle}
            aria-haspopup="menu"
            aria-disabled={disabled}
            data-rl-menu-toggle=""
            onClick={(event) => {
              if (!busy) props.onOpenMoreMenu(row, event.currentTarget);
            }}
          >
            <DotsIcon />
          </button>
        </div>
      </td>
    </tr>
  );
}

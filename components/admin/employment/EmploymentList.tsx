"use client";
// 在籍・退職の在籍者・退職者・求職者の一覧（11-3 §2.14・§2.19）。並べたあとの人（retention.ts の sortForTab）を、見出しの行と人ごとの
// 白いカードの行で描く。列は お名前・タイプ・入社日・（退職者は退職日、ほかは職業）・勤続・「変更」で、チームの列と結果詳細への
// リンクは置かない。各値の前に、狭い幅（本文の幅 700px 以下）でだけ見えるラベル span.pg-lb を置く。0 人のときは点線の枠にタブごとの
// 1 行目と共通の 2 行目。タイプの丸の色は分類の濃い色（QUADRANTS[].colors.dark。タイプ名に添えた印で K-50 の対象外。読み上げない）。
// 送信中の人の「変更」は aria-disabled にする（押しても何もしない。親の EmploymentView が判定する）
import type { MouseEvent } from "react";

import { EMPLOYMENT_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  CHARACTER_CELLS,
  QUADRANTS,
  type CharacterCell,
} from "@/lib/presentation/classification-view";
import { formatCalendarDateSlashPadded } from "@/lib/presentation/format-datetime";
import { formatTenure, tenureMonths, type EmploymentTab } from "@/lib/presentation/retention";
import type { AptitudeTypeKey } from "@/lib/scoring/types";
import type { EmploymentPersonDto } from "@/lib/services/dto/admin";

const CELL_OF: ReadonlyMap<AptitudeTypeKey, CharacterCell> = new Map(
  CHARACTER_CELLS.map((cell) => [cell.type, cell]),
);

function cellOf(type: AptitudeTypeKey): CharacterCell {
  const cell = CELL_OF.get(type);
  if (cell === undefined) throw new RangeError(`キャラクターの枠がありません: ${type}`);
  return cell;
}

/** 暦日のセルの値（YYYY/MM/DD。無ければ「—」） */
function DateValue(props: { readonly ymd: string | null }) {
  return props.ymd === null ? (
    <span className="pg-mu">{EMPLOYMENT_SCREEN_TEXTS.list.none}</span>
  ) : (
    <>{formatCalendarDateSlashPadded(props.ymd)}</>
  );
}

export function EmploymentList(props: {
  readonly tab: Exclude<EmploymentTab, "an">;
  /** そのタブの人（チームで絞り、sortForTab で並べたあと） */
  readonly people: readonly EmploymentPersonDto[];
  /** 勤続の基準日（GET /api/v1/admin/employment の today） */
  readonly today: string;
  /** 送信中の人（代表の resultId） */
  readonly pending: ReadonlySet<string>;
  readonly onEdit: (person: EmploymentPersonDto, button: HTMLButtonElement) => void;
}) {
  const t = EMPLOYMENT_SCREEN_TEXTS;
  if (props.people.length === 0) {
    return (
      <div className="pg-emp">
        {t.empty[props.tab]}
        <br />
        {t.empty.hint}
      </div>
    );
  }
  const isLeftTab = props.tab === "left";
  return (
    <div className="pg-list">
      <div className="pg-row hd">
        <div>{t.list.headers.name}</div>
        <div>{t.list.headers.type}</div>
        <div>{t.list.headers.hiredOn}</div>
        <div>{isLeftTab ? t.list.headers.leftOn : t.list.headers.occupation}</div>
        <div>{t.list.headers.tenure}</div>
        <div />
      </div>
      {props.people.map((person) => {
        const cell = cellOf(person.aptitudeType);
        const busy = props.pending.has(person.resultId);
        return (
          <div key={person.resultId} className="pg-row" data-testid={`em-row-${person.resultId}`}>
            <div className="pg-nm">{person.name === "" ? t.list.noName : person.name}</div>
            <div className="pg-ty">
              <i style={{ background: QUADRANTS[cell.quadrant].colors.dark }} aria-hidden="true" />
              {cell.shortLabel}
            </div>
            <div>
              <span className="pg-lb">{t.list.labels.hiredOn}</span>
              <DateValue ymd={person.hiredOn} />
            </div>
            {isLeftTab ? (
              <div>
                <span className="pg-lb">{t.list.labels.leftOn}</span>
                <DateValue ymd={person.leftOn} />
              </div>
            ) : (
              <div>
                <span className="pg-lb">{t.list.labels.occupation}</span>
                {person.occupationLabel ?? <span className="pg-mu">{t.list.none}</span>}
              </div>
            )}
            <div className="pg-ten">
              <span className="pg-lb">{t.list.labels.tenure}</span>
              {formatTenure(tenureMonths(person, props.today))}
            </div>
            <div className="pg-ed">
              <button
                type="button"
                aria-disabled={busy ? "true" : undefined}
                onClick={(event: MouseEvent<HTMLButtonElement>) =>
                  props.onEdit(person, event.currentTarget)
                }
              >
                {t.list.edit}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

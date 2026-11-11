"use client";
// 在籍・退職の分析「辞めやすいタイプと勤続年数」（11-3 §2.16・§2.19）。チームで絞った後の人を analyzeRetention（retention.ts。区分が
// 在籍・退職の人だけを数え、求職者は関数の中で除く）で集計し、見出しと説明、数字のカード（4 枚。勤続未入力者がいれば 5 枚）、注意書き、
// タイプ別の表、脚注を描く。退職の割合の棒は CSS で描く（10 K-23。棒の地は分類の濃い色。割合を文字でも出す棒で K-50 の対象外）。
// 表のイラストは飾り（alt=""）で、自作の正方形の絵（K-05）を 38px の丸に収める。狭い幅（本文の幅 760px 以下）の勤続のラベルは CSS の
// content（app/(admin)/admin.css）
import { Illustration } from "@/components/ui/Illustration";
import { EMPLOYMENT_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  CHARACTER_CELLS,
  QUADRANTS,
  type CharacterCell,
} from "@/lib/presentation/classification-view";
import {
  analyzeRetention,
  formatTenure,
  type EmploymentCarrier,
  type RetentionRow,
} from "@/lib/presentation/retention";
import type { AptitudeTypeKey } from "@/lib/scoring/types";

const CELL_OF: ReadonlyMap<AptitudeTypeKey, CharacterCell> = new Map(
  CHARACTER_CELLS.map((cell) => [cell.type, cell]),
);

function cellOf(type: AptitudeTypeKey): CharacterCell {
  const cell = CELL_OF.get(type);
  if (cell === undefined) throw new RangeError(`キャラクターの枠がありません: ${type}`);
  return cell;
}

export function RetentionAnalysis(props: {
  /** チームで絞った後の人（求職者を含んでよい） */
  readonly people: readonly EmploymentCarrier[];
  /** 勤続の基準日（GET /api/v1/admin/employment の today） */
  readonly today: string;
  /** 説明の先頭（チームで絞っているときの「Aチームの」「未設定の」。絞っていなければ ""） */
  readonly teamPrefix: string;
}) {
  const t = EMPLOYMENT_SCREEN_TEXTS.analysis;
  const a = analyzeRetention(props.people, props.today);
  const missing = a.missingHireCount + a.missingLeaveCount;
  return (
    <div className="ob-ret">
      <div className="ret-h">
        <h2>{t.title}</h2>
        <p>
          {props.teamPrefix}
          {t.lead}
        </p>
      </div>
      <div className="ret-kpi" data-testid="ret-kpi">
        <div className="ret-k">
          <div className="k">{t.cards.left}</div>
          <div className="v">
            {a.leftCount}
            <small>{t.cards.unit}</small>
          </div>
          <div className="s">{t.cards.leftRate(a.leftRatePercent)}</div>
        </div>
        <div className="ret-k">
          <div className="k">{t.cards.stay}</div>
          <div className="v">
            {a.stayCount}
            <small>{t.cards.unit}</small>
          </div>
          <div className="s">{t.cards.stayNote}</div>
        </div>
        <div className="ret-k">
          <div className="k">{t.cards.leftTenure}</div>
          <div className="v">{formatTenure(a.leftTenure.average)}</div>
          <div className="s">{t.cards.averageOf(a.leftTenure.count)}</div>
        </div>
        <div className="ret-k">
          <div className="k">{t.cards.stayTenure}</div>
          <div className="v">{formatTenure(a.stayTenure.average)}</div>
          <div className="s">{t.cards.averageOfToday(a.stayTenure.count)}</div>
        </div>
        {missing > 0 ? (
          <div className="ret-k warn">
            <div className="k">{t.cards.missing}</div>
            <div className="v">
              {missing}
              <small>{t.cards.unit}</small>
            </div>
            <div className="s">
              {t.cards.missingDetail(a.missingHireCount, a.missingLeaveCount)}
            </div>
          </div>
        ) : null}
      </div>
      {a.note === null ? null : (
        <div className="ret-note">
          {a.note.kind === "no_left" ? t.notes.noLeft : t.notes.fewLeft(a.note.count)}
        </div>
      )}
      <div className="ret-tb">
        <div className="ret-r hd">
          <div className="c1">{t.table.type}</div>
          <div className="n c2">{t.table.stay}</div>
          <div className="n c3">{t.table.left}</div>
          <div className="c4">{t.table.rate}</div>
          <div className="c5">{t.table.leftTenure}</div>
          <div className="c6">{t.table.stayTenure}</div>
        </div>
        {a.rows.length === 0 ? (
          <div className="ret-r">{t.table.noRows}</div>
        ) : (
          a.rows.map((row) => <RetentionTableRow key={row.aptitudeType} row={row} />)
        )}
      </div>
      <div className="ret-ft">{t.footnote}</div>
    </div>
  );
}

function RetentionTableRow(props: { readonly row: RetentionRow }) {
  const t = EMPLOYMENT_SCREEN_TEXTS.analysis.table;
  const { row } = props;
  const cell = cellOf(row.aptitudeType);
  return (
    <div className="ret-r" data-testid={`ret-row-${row.aptitudeType}`}>
      <div className="ret-who c1">
        <Illustration
          src={`/images/types/${row.aptitudeType}.svg`}
          alt=""
          width={38}
          height={38}
          decorative
        />
        <div>
          <b>{cell.shortLabel}</b>
          <span>{cell.hiragana}</span>
        </div>
      </div>
      <div className="n c2">{row.stayCount}</div>
      <div className="n c3">{row.leftCount}</div>
      <div className="ret-bar c4">
        <i>
          <u
            style={{
              width: `${row.percent}%`,
              background: QUADRANTS[cell.quadrant].colors.dark,
            }}
          />
        </i>
        <em>{t.percent(row.percent)}</em>
        <small>{row.isReference ? t.reference : ""}</small>
      </div>
      <div className="tn c5">{formatTenure(row.leftTenureAverage)}</div>
      <div className="tn c6">{formatTenure(row.stayTenureAverage)}</div>
    </div>
  );
}

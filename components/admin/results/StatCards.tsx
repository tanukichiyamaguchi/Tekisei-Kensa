"use client";
// 集計カード 4 枚（11-2 §2.5）。値は絞り込みの前の全行（computeListStats）。3 番「受験から1年以上たった人」は 1 人以上なら
// カード全体を 1 つのボタンにし、押すと区分を「受験から1年以上」にする（ResultsView が表示の上限を戻して状態を保存する）
import type { ReactNode } from "react";

import type { ListStats } from "@/lib/presentation/result-list-view";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";

function CardBody(props: {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly sub: ReactNode;
}) {
  return (
    <>
      <span className="rl-card__label">{props.label}</span>
      <span className="rl-card__value">
        {props.value}
        <span className="rl-card__unit">{props.unit}</span>
      </span>
      <span className="rl-card__sub">{props.sub}</span>
    </>
  );
}

export function StatCards(props: {
  readonly stats: ListStats;
  readonly canViewExecutives: boolean;
  readonly onShowOneYear: () => void;
}) {
  const t = RESULT_LIST_TEXTS.stats;
  const s = props.stats;
  const oneYear = (
    <CardBody
      label={t.oneYear}
      value={s.oneYearRows}
      unit={t.oneYearUnit}
      sub={s.oneYearRows > 0 ? t.oneYearAction : t.oneYearNone}
    />
  );
  return (
    <div className="rl-stats">
      <div className="rl-card">
        <CardBody
          label={t.people}
          value={s.rowCount}
          unit={t.peopleUnit}
          sub={
            props.canViewExecutives
              ? t.peopleByStatus(s.candidateRows, s.employedRows)
              : t.examTotal(s.examCount)
          }
        />
      </div>
      <div className="rl-card">
        <CardBody
          label={t.thisMonth}
          value={s.thisMonthExams}
          unit={t.thisMonthUnit}
          sub={t.lastMonth(s.lastMonthExams)}
        />
      </div>
      {s.oneYearRows > 0 ? (
        <button type="button" className="rl-card rl-card--alert" onClick={props.onShowOneYear}>
          {oneYear}
        </button>
      ) : (
        <div className="rl-card">{oneYear}</div>
      )}
      <div className="rl-card">
        <CardBody
          label={t.longitudinal}
          value={s.longitudinalReports}
          unit={t.longitudinalUnit}
          sub={t.multiExam(s.multiExamRows)}
        />
      </div>
    </div>
  );
}

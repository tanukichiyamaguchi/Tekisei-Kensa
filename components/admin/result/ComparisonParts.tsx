"use client";
// 比較に依存する表示部品（06 §3.5.3）。すべて同一の ComparisonDto から描く（要件定義書 §11 の 3・10 番）
import { useComparison, useReadyComparison } from "./ComparisonProvider";
import { DonutGauge } from "@/components/charts/DonutGauge";
import { GradeLetter } from "@/components/charts/GradeLetter";
import { TraitRadar } from "@/components/charts/TraitRadar";
import { Illustration } from "@/components/ui/Illustration";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { matchScoreGauge } from "@/lib/presentation/chart-series";
import {
  SHOW_DEVIATION_SCORE,
  formatPopulationLabel,
  populationNote,
  toPositionView,
} from "@/lib/presentation/comparison-view";
import { formatDeviationScore } from "@/lib/presentation/rounding";
import type { TraitScores } from "@/lib/scoring/types";

function Loading(props: { readonly minHeight?: number | undefined }) {
  return (
    <p className="comparison-placeholder" style={{ minHeight: props.minHeight }}>
      読み込み中…
    </p>
  );
}

/** 評価レター（未選択・0 件は固定文言） */
export function ComparisonGrade() {
  const state = useComparison();
  if (state.kind === "loading") return <Loading />;
  const comparison = state.kind === "ready" ? state.comparison : null;
  return (
    <div className="grade-block">
      <GradeLetter grade={comparison?.grade ?? null} />
      {comparison ? (
        <PopulationNote
          size={comparison.populationSize}
          includesSubject={comparison.includesSubject}
          onlySingle
        />
      ) : null}
    </div>
  );
}

/** 合致度ゲージ */
export function ComparisonMatchGauge(props: { readonly size?: number }) {
  const state = useComparison();
  if (state.kind === "loading") return <Loading minHeight={props.size} />;
  if (state.kind !== "ready") {
    return (
      <div className="gauge-placeholder">
        <p className="gauge-placeholder__label">組織との合致度</p>
        <p className="grade-letter__placeholder">{ADMIN_TEXTS.comparisonRequired}</p>
      </div>
    );
  }
  const gauge = matchScoreGauge(state.comparison);
  return (
    <DonutGauge
      value={gauge.value}
      color={gauge.color}
      label={gauge.label}
      title={gauge.title}
      {...(props.size ? { size: props.size } : {})}
    />
  );
}

/** 16 軸レーダー（比較選択時は比較対象系列を重ねる） */
export function TraitRadarWithComparison(props: {
  readonly subjectName: string;
  readonly subject: TraitScores;
  readonly width: number;
  readonly height: number;
  readonly plotRadius?: number | undefined;
}) {
  const comparison = useReadyComparison();
  return (
    <TraitRadar
      subjectName={props.subjectName}
      subject={props.subject}
      comparison={comparison?.traitAverages ?? null}
      width={props.width}
      height={props.height}
      plotRadius={props.plotRadius}
    />
  );
}

/** 比較対象内での立ち位置（§3.5.7） */
export function ComparisonPosition() {
  const state = useComparison();
  if (state.kind === "loading") return <Loading minHeight={160} />;
  if (state.kind !== "ready") {
    return <p className="grade-letter__placeholder">{ADMIN_TEXTS.comparisonRequired}</p>;
  }
  const view = toPositionView(state.comparison);
  return (
    <div className="position-view">
      <Illustration src={view.imagePath} alt={view.label} width={240} height={160} />
      <div>
        <p className="position-view__label">{view.label}</p>
        <ul className="plain-list">
          {view.descriptionLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {SHOW_DEVIATION_SCORE ? (
          <p className="muted">偏差値 {formatDeviationScore(state.comparison.deviationScore)}</p>
        ) : null}
      </div>
    </div>
  );
}

function PopulationNote(props: {
  readonly size: number;
  readonly includesSubject: boolean;
  /** 評価の近く（1 名のときの注記 T-11・T-27）だけを出す */
  readonly onlySingle?: boolean;
}) {
  const note = populationNote(props.size, props.includesSubject);
  if (!note) return null;
  if (props.onlySingle && props.size !== 1) return null;
  if (!props.onlySingle && props.size === 1) return null;
  return <span className="muted small">{note}</span>;
}

/** ヘッダー補足行の比較対象と母集団人数（T-10・T-28） */
export function PopulationSummary() {
  const state = useComparison();
  if (state.kind === "empty") {
    return (
      <span className="notice-inline" role="status">
        {ADMIN_TEXTS.populationEmpty}
      </span>
    );
  }
  if (state.kind !== "ready") return null;
  const { comparison } = state;
  return (
    <span data-testid="population-label">
      {formatPopulationLabel(comparison.scope, comparison.populationSize)}{" "}
      <PopulationNote
        size={comparison.populationSize}
        includesSubject={comparison.includesSubject}
      />
    </span>
  );
}

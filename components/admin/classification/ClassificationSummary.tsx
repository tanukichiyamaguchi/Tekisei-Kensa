"use client";
// 組織内分類の集計カード（11-3 §2.6〜§2.8）: 人数（ラベルは対象で変わる）、割合（割合バーと凡例）、チーム（2 種類以上のときだけ）、
// 全員／在籍／退職。値は ClassificationView が summarizeClassification で計算して渡す（チームは正規化した値）。
// チームと対象の書き換えは view-state の setTeam・setMode（表示の状態。§2.18）。凡例を押すとその分類の詳細パネル（押した要素を渡す）
import { setMode, setTeam } from "./view-state";
import { CLASSIFICATION_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  percentOf,
  QUADRANT_ORDER,
  QUADRANTS,
  teamLabelOf,
  type ClassificationMode,
  type ClassificationSummary as SummaryValues,
  type TeamFilter,
} from "@/lib/presentation/classification-view";
import type { SocialStyleKey } from "@/lib/scoring/types";

const MODES: readonly ClassificationMode[] = ["all", "stay", "left"];

export function ClassificationSummary(props: {
  readonly summary: SummaryValues;
  /** チームの選択肢（teamChoices。チームで絞る前の人の、使われているチーム） */
  readonly teamChoices: readonly Exclude<TeamFilter, "">[];
  /** 正規化したチーム（normalizeTeamFilter） */
  readonly team: TeamFilter;
  readonly mode: ClassificationMode;
  readonly onOpenQuadrant: (quadrant: SocialStyleKey, opener: HTMLElement) => void;
}) {
  const t = CLASSIFICATION_SCREEN_TEXTS.summary;
  const s = props.summary;
  return (
    <div className="ob-sum">
      <div className="ob-total">
        <span className="l">{s.totalLabel}</span>
        <b data-testid="ob-count">{s.total}</b>
        <span className="u">{t.unit}</span>
      </div>
      <div className="ob-bal">
        <div className="ob-bar" aria-hidden="true">
          {QUADRANT_ORDER.filter((key) => s.byQuadrant[key] > 0).map((key) => (
            <i
              key={key}
              style={{
                width: `${(s.byQuadrant[key] / s.total) * 100}%`,
                background: QUADRANTS[key].colors.main,
              }}
            />
          ))}
        </div>
        <div className="ob-leg">
          {QUADRANT_ORDER.map((key) => {
            const q = QUADRANTS[key];
            const n = s.byQuadrant[key];
            return (
              <button
                key={key}
                type="button"
                data-testid={`ob-legend-${key}`}
                onClick={(event) => props.onOpenQuadrant(key, event.currentTarget)}
              >
                <i className="dot" style={{ background: q.colors.main }} />
                <b>{q.katakana}</b>
                {t.count(n)}
                <em style={{ color: q.colors.text }}>{t.percent(percentOf(n, s.total))}</em>
              </button>
            );
          })}
        </div>
      </div>
      {props.teamChoices.length >= 2 ? (
        <label className="ob-team">
          <span>{t.team}</span>
          <select
            value={props.team}
            onChange={(event) => setTeam(event.target.value as TeamFilter)}
          >
            <option value="">{t.teamAll}</option>
            {props.teamChoices.map((choice) => (
              <option key={choice} value={choice}>
                {teamLabelOf(choice)}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="ob-seg" role="group" aria-label={t.modesLabel}>
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={props.mode === mode}
            data-testid={`ob-seg-${mode}`}
            className={props.mode === mode ? "on" : undefined}
            onClick={() => setMode(mode)}
          >
            {t.modes[mode]} <b>{s.modeCounts[mode]}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

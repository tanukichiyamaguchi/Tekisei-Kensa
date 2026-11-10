"use client";
// 組織内分類のマップ（11-3 §2.9〜§2.11）: 軸（読み上げない）、4 象限（見出しのボタン・人数のピル・折りたたみ）、16 キャラクターの枠。
// 分類ごとの色は CSS 変数で style 属性に置く（象限の --qc・--qbg・--qmid・--qsub、枠の --cbg・--lc。色の値は QUADRANTS。K-49）。
// 畳むか: 折りたたみのボタンを押した象限は押したとおり（view-state の folds。§2.18）、押していない象限は画面の幅が 700px 以下なら畳む
// （useSyncExternalStore で matchMedia を読む。サーバの描画では広いとする。§2.10）。見出しのボタンと枠を押すと詳細パネル（押した要素を渡す）
import { useSyncExternalStore, type CSSProperties } from "react";

import { setFold } from "./view-state";
import { Illustration } from "@/components/ui/Illustration";
import { CLASSIFICATION_SCREEN_TEXTS } from "@/lib/presentation/classification-texts";
import {
  cellBackground,
  CHARACTER_CELLS,
  percentOf,
  QUADRANT_ORDER,
  QUADRANTS,
  type CharacterCell,
  type ClassificationSummary as SummaryValues,
} from "@/lib/presentation/classification-view";
import type { AptitudeTypeKey, SocialStyleKey } from "@/lib/scoring/types";

/** CSS 変数を置く style 属性 */
type StyleWithVars = CSSProperties & Readonly<Record<`--${string}`, string>>;

/** 押していない象限を畳む画面の幅（§2.10・§2.19） */
const NARROW_SCREEN_QUERY = "(max-width: 700px)";

function subscribeNarrowScreen(listener: () => void): () => void {
  const query = window.matchMedia(NARROW_SCREEN_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

const isNarrowScreen = () => window.matchMedia(NARROW_SCREEN_QUERY).matches;
/** サーバの描画では広い画面とする */
const isNarrowScreenOnServer = () => false;

export function ClassificationMap(props: {
  readonly summary: SummaryValues;
  /** 折りたたみのボタンを押した象限だけの状態（true = 畳んでいる。view-state の folds） */
  readonly folds: Readonly<Partial<Record<SocialStyleKey, boolean>>>;
  readonly onOpenQuadrant: (quadrant: SocialStyleKey, opener: HTMLElement) => void;
  readonly onOpenType: (type: AptitudeTypeKey, opener: HTMLElement) => void;
}) {
  const t = CLASSIFICATION_SCREEN_TEXTS;
  const narrow = useSyncExternalStore(
    subscribeNarrowScreen,
    isNarrowScreen,
    isNarrowScreenOnServer,
  );
  return (
    <div className="ob-wrap">
      <div className="ob-ax-x" aria-hidden="true">
        <span>{t.axis.left}</span>
        <i />
        <span>{t.axis.right}</span>
      </div>
      <div className="ob-ax-y" aria-hidden="true">
        <span>{t.axis.top}</span>
        <i />
        <span>{t.axis.bottom}</span>
      </div>
      <div className="ob-map">
        {QUADRANT_ORDER.map((key) => (
          <Quadrant
            key={key}
            quadrant={key}
            summary={props.summary}
            folded={props.folds[key] ?? narrow}
            onOpenQuadrant={props.onOpenQuadrant}
            onOpenType={props.onOpenType}
          />
        ))}
      </div>
    </div>
  );
}

function Quadrant(props: {
  readonly quadrant: SocialStyleKey;
  readonly summary: SummaryValues;
  readonly folded: boolean;
  readonly onOpenQuadrant: (quadrant: SocialStyleKey, opener: HTMLElement) => void;
  readonly onOpenType: (type: AptitudeTypeKey, opener: HTMLElement) => void;
}) {
  const t = CLASSIFICATION_SCREEN_TEXTS;
  const q = QUADRANTS[props.quadrant];
  const n = props.summary.byQuadrant[props.quadrant];
  const className = [
    "ob-q",
    q.y === 1 ? "b" : null, // 下の段は見出しを下に
    q.x === 1 ? "r" : null, // 右の列は見出しを右寄せに
    props.folded ? "fold" : null,
  ]
    .filter((c): c is string => c !== null)
    .join(" ");
  const style: StyleWithVars = {
    "--qc": q.colors.onMid,
    "--qbg": q.colors.bg,
    "--qmid": q.colors.mid,
    "--qsub": q.colors.cellSub,
  };
  return (
    <div className={className} data-testid={`ob-quadrant-${props.quadrant}`} style={style}>
      <div className="ob-qhr">
        <button
          type="button"
          className="ob-qh"
          aria-label={t.quadrant.headingLabel(q.katakana, q.labelJa, n)}
          onClick={(event) => props.onOpenQuadrant(props.quadrant, event.currentTarget)}
        >
          <span>
            <span className="nm">{q.katakana}</span>
            <span className="jp">{q.labelJa}</span>
          </span>
          <span className="ct">
            <b data-testid="ob-count">{n}</b>
            <span>{t.summary.unit}</span>
            <small>{t.summary.percent(percentOf(n, props.summary.total))}</small>
          </span>
        </button>
        <button
          type="button"
          className="ob-fold"
          aria-expanded={!props.folded}
          aria-label={t.quadrant.foldLabel(q.katakana)}
          onClick={() => setFold(props.quadrant, !props.folded)}
        >
          <i>{t.quadrant.foldMark}</i>
        </button>
      </div>
      <div className="ob-g">
        {CHARACTER_CELLS.filter((cell) => cell.quadrant === props.quadrant).map((cell) => (
          <CharacterButton
            key={cell.type}
            cell={cell}
            summary={props.summary}
            onOpenType={props.onOpenType}
          />
        ))}
      </div>
    </div>
  );
}

function CharacterButton(props: {
  readonly cell: CharacterCell;
  readonly summary: SummaryValues;
  readonly onOpenType: (type: AptitudeTypeKey, opener: HTMLElement) => void;
}) {
  const t = CLASSIFICATION_SCREEN_TEXTS;
  const { cell } = props;
  const n = props.summary.byType[cell.type];
  const style: StyleWithVars = {
    "--cbg": cellBackground(n, props.summary.maxTypeCount, QUADRANTS[cell.quadrant].colors.mid),
    "--lc": cell.lean.color,
  };
  return (
    <button
      type="button"
      className={n === 0 ? "ob-c z" : "ob-c"}
      data-testid={`ob-cell-${cell.type}`}
      style={style}
      aria-label={t.cell.label(cell.hiragana, cell.shortLabel, cell.lean.label, n)}
      onClick={(event) => props.onOpenType(cell.type, event.currentTarget)}
    >
      <Illustration
        src={`/images/types/${cell.type}.svg`}
        alt=""
        width={62}
        height={112}
        decorative
        loading="lazy"
      />
      <span className="who">{cell.hiragana}</span>
      <span className="ty">{cell.shortLabel}</span>
      <span className={cell.lean.kind === "core" ? "lean core" : "lean"}>
        {cell.lean.arrow !== null ? <span aria-hidden="true">{cell.lean.arrow}</span> : null}
        {cell.lean.label}
      </span>
      <span className="n">
        <b data-testid="ob-count">{n}</b>
        <span>{t.summary.unit}</span>
      </span>
    </button>
  );
}

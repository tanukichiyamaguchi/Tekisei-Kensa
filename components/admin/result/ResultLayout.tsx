"use client";
// 新しいレイアウトの根 #rs2（11-4 §2.1・§2.2・§2.7〜§2.12・§2.16）。比較の状態（useComparison）と画面の状態（ResultViewStateContext）を、
// 概要・16の特性・リスク・組織との相性・人物像の 5 つのセクションに props で配る（育て方・接し方は PR-7.8b。それまでは旧のセクション 5・6 が
// #rs2 の後ろに残る）。#rs2 に比較の状態 data-comparison（none・loading・ready・empty・error）を付ける（E2E と印刷用ページの待ち合わせ用。
// 見た目には使わない）。非表示の PDF（visibility.showRisks が偽）はリスクのセクションを描かない（§2.18）。
// 画面の形だけ: 2 つのポップアップを #rs2 の外（後ろ）に描き（§2.2）、描いた直後にたたみ方がまだ決まっていなければ、画面の幅 700px 以下で
// 概要以外をたたんだ状態から始める（§2.16。以後は result-ui-memory.ts で保つ）。比較の状態（種類と比較組織）が前と変わったら、
// 項目の説明を閉じる（最初の描画では閉じない。§2.8.4）。人が替わるときは ResultDetailBody ごと key={resultId} で作り直す（§2.1）
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useComparison, type ComparisonState } from "./ComparisonProvider";
import { FoldableSection } from "./FoldableSection";
import { resultUiMemory } from "./result-ui-memory";
import {
  useResultViewActions,
  useResultViewState,
  type ResultDetailVariant,
} from "./ResultViewStateContext";
import { FitSection } from "./sections/FitSection";
import { OverviewSection } from "./sections/OverviewSection";
import { ProfileSection } from "./sections/ProfileSection";
import { RiskSection } from "./sections/RiskSection";
import { TraitsSection } from "./sections/TraitsSection";
import { TraitHighlightPopups, type TraitHighlightSide } from "./TraitHighlightPopups";
import type { PdfSectionVisibility } from "@/lib/pdf/visibility";
import { RESULT_SECTIONS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";
import { RESULT_SECTION_IDS, type ResultSectionId } from "@/lib/presentation/result-view-state";

/** 初めのたたみ方を決める画面の幅（§2.16。700px 以下は概要以外をたたむ） */
const NARROW_FOLD_QUERY = "(max-width: 700px)";

/** PR-7.8a で描くセクション（育て方 rs-ln・接し方 rs-ss は PR-7.8b）。非表示の PDF はリスクを描かない */
export function renderedSectionIds(
  visibility: Pick<PdfSectionVisibility, "showRisks">,
): readonly ResultSectionId[] {
  return (["rs-ov", "rs-tr", "rs-rk", "rs-fit", "rs-pf"] as const).filter(
    (id) => id !== "rs-rk" || visibility.showRisks,
  );
}

/** 比較の状態のかぎ（種類と比較組織。変わったら項目の説明を閉じる） */
function comparisonKey(state: ComparisonState): string {
  if (state.kind === "none") return "none";
  const scope =
    state.scope.kind === "organization" ? "organization" : `team:${state.scope.teamCode}`;
  return `${state.kind}:${scope}`;
}

const sectionText = (id: ResultSectionId) => RESULT_SECTIONS.find((section) => section.id === id);

export function ResultLayout(props: {
  readonly view: ResultDetailView;
  readonly variant: ResultDetailVariant;
  readonly visibility: PdfSectionVisibility;
}) {
  const { view, variant, visibility } = props;
  const screen = variant === "screen";
  const comparison = useComparison();
  const viewState = useResultViewState();
  const actions = useResultViewActions();
  const [popup, setPopup] = useState<TraitHighlightSide | null>(null);

  // 初めのたたみ方（ページを読み込んでから初めて結果詳細を出したときだけ。画面の幅 700px 以下は概要以外をたたむ）
  useEffect(() => {
    if (!screen || resultUiMemory.folded !== null) return;
    const narrow = window.matchMedia(NARROW_FOLD_QUERY).matches;
    actions.setFoldedAll(
      Object.fromEntries(RESULT_SECTION_IDS.map((id) => [id, narrow && id !== "rs-ov"])) as Record<
        ResultSectionId,
        boolean
      >,
    );
    // 描いた直後に 1 回だけ（actions は描くたびに作り直されるので依存に含めない）
  }, [screen]);

  // 比較の状態が変わったら項目の説明を閉じる（最初の描画では閉じない。並び替えでは閉じない）
  const key = comparisonKey(comparison);
  const previousKey = useRef(key);
  useEffect(() => {
    if (!screen || previousKey.current === key) return;
    previousKey.current = key;
    actions.setTraitHelp(null);
    // actions は描くたびに作り直されるので依存に含めない（かぎが変わったときだけ閉じる）
  }, [screen, key]);

  const section = (id: ResultSectionId, children: ReactNode) => {
    const text = sectionText(id);
    if (!text) return null;
    return (
      <FoldableSection
        key={id}
        id={id}
        title={text.title}
        description={comparison.kind === "ready" ? text.descriptionReady : text.description}
        folded={viewState.folded.includes(id)}
        onToggle={screen ? () => actions.toggleFold(id) : undefined}
      >
        {children}
      </FoldableSection>
    );
  };

  return (
    <>
      <div id="rs2" data-comparison={comparison.kind}>
        {renderedSectionIds(visibility).map((id) => {
          switch (id) {
            case "rs-ov":
              return section(
                id,
                <OverviewSection
                  view={view}
                  comparison={comparison}
                  visibility={visibility}
                  variant={variant}
                  onOpenPopup={screen ? setPopup : undefined}
                />,
              );
            case "rs-tr":
              return section(
                id,
                <TraitsSection
                  view={view}
                  comparison={comparison}
                  viewState={viewState}
                  actions={actions}
                  variant={variant}
                />,
              );
            case "rs-rk":
              return section(id, <RiskSection view={view} />);
            case "rs-fit":
              return section(id, <FitSection view={view} comparison={comparison} />);
            case "rs-pf":
              return section(id, <ProfileSection view={view} />);
            default:
              return null;
          }
        })}
      </div>
      {screen ? (
        <TraitHighlightPopups traits={view.traits} open={popup} onClose={() => setPopup(null)} />
      ) : null}
    </>
  );
}

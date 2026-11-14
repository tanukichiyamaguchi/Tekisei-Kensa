"use client";
// AI 解説の領域（11-6 §2.1・§2.2・§3.9。参照元定義の Group AI。見た目は別表C）。結果詳細のページ（Server Component）が作り、11-4 の
// ResultDetailPage を通して ResultDetailBody の aiArea に渡す（目次と新しいレイアウトの間。要素 id ai は目次の「AI解説」の行き先）。
// section#ai（読み上げの名前「AI解説」）に、上にタブの行（AiTabs）、その下に出せるタブのパネルをすべて描き、選んでいないパネルは hidden で
// 隠す（タブを切り替えても読み直しを失わない。§2.1）。初めのタブ initialTab は、ページが URL の ai から initialAiTab で選んだもの
// （§3.7.6）。選んだタブは、描いた直後とタブを変えるたびに画面の状態（useResultViewState() の aiTab）に書く（URL は変えない。PDF の
// ダウンロード（PR-7.12）が読む）。PR-7.9 は経年比較のタブを出さない（visibleTabs は採用向けと育成・定着。責任者の受験は [] で、ページが
// この領域を作らない。11-6 §4.4）。経年比較のパネルと 1 年経過の帯の reexamRequest（PR-7.11a）、名字の置き換えの respondentName
// （PR-7.11b）、印刷の形の variant（PR-7.12）は後の PR が足す。ai-area.css はここで読み込む（印刷用ページは PR-7.12 まで
// PrintResultDocument が読み込む）
import { useEffect, useRef, useState } from "react";

import { AiTabs, type AiTabRefs } from "./AiTabs";
import { RecruitmentPanel } from "./RecruitmentPanel";
import { TrainingPanel } from "./TrainingPanel";
import { useResultViewActions } from "@/components/admin/result/ResultViewStateContext";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";
import type { AiAreaDto } from "@/lib/services/dto/ai";

import "./ai-area.css";

export function AiArea(props: {
  readonly resultId: string;
  readonly initial: AiAreaDto;
  /** 初めに選ぶタブ（ページが initialAiTab(visibleTabs, URL の ai) で選んだもの。visibleTabs のどれか） */
  readonly initialTab: AiAnalysisKind;
}) {
  const { initial } = props;
  const [tab, setTab] = useState<AiAnalysisKind>(props.initialTab);
  const tabRefs: AiTabRefs = useRef<Partial<Record<AiAnalysisKind, HTMLButtonElement | null>>>({});
  const { setAiTab } = useResultViewActions();
  const setAiTabRef = useRef(setAiTab);
  setAiTabRef.current = setAiTab;

  // 選んだタブを画面の状態に書く（初めの描画を含む）
  useEffect(() => {
    setAiTabRef.current(tab);
  }, [tab]);

  const recruitment = initial.visibleTabs.includes("recruitment") ? initial.recruitment : null;
  const training = initial.visibleTabs.includes("training") ? initial.training : null;

  return (
    <section id="ai" aria-label={AI_TEXTS.area.label}>
      <AiTabs tabs={initial.visibleTabs} selected={tab} onSelect={setTab} tabRefs={tabRefs} />
      {recruitment !== null ? (
        <RecruitmentPanel
          resultId={props.resultId}
          initial={recruitment}
          selected={tab === "recruitment"}
          focusTab={(options) => tabRefs.current.recruitment?.focus(options)}
        />
      ) : null}
      {training !== null ? (
        <TrainingPanel initial={training} selected={tab === "training"} />
      ) : null}
    </section>
  );
}

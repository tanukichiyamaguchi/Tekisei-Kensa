"use client";
// 採用向けのパネル（11-6 §2.4。§2.3.5 の表）。useAiGeneration(…, "recruitment") の状態と panelParts で、上から生成の入口（.ai-start: 案内 →
// 失敗の枠 → 生成ボタン）、生成中（10 分たっても終わらなければ、代わりに T-29 の失敗の枠）、表示（RecruitmentView）を出す。選んでいない
// ときは hidden で隠す（読み直しを失わない。§2.1）。data-status は今の状態（E2E が待ち合わせに使う。見た目に関わらない）。
// 焦点: 生成ボタンは生成を始めるとすぐ消える（§2.3.2）。焦点のある生成ボタンを押したら、ボタンが消える前に選んでいるタブへ焦点を移す
// （body に落とさない。キーボードで押したときはタブに焦点の枠が出て、留まった目次の下に入れば ResultToc の focusin の処理が目次の下へ
// 動かす。マウスで押したときは画面を動かさない）。生成の完了・失敗のあとも焦点はタブのまま（失敗でボタンが戻っても動かさない）
import type { MouseEvent } from "react";

import { AiFailureNotice } from "./AiFailureNotice";
import { AiGenerateButton } from "./AiGenerateButton";
import { AiGenerating } from "./AiGenerating";
import { AiIntro } from "./AiIntro";
import { RecruitmentView } from "./RecruitmentView";
import { useAiGeneration } from "./use-ai-generation";
import { panelParts } from "@/lib/presentation/ai-area";
import { AI_TEXTS, aiFailureText } from "@/lib/presentation/ai-texts";
import type { RecruitmentAiDto } from "@/lib/services/dto/ai";

export function RecruitmentPanel(props: {
  readonly resultId: string;
  readonly initial: RecruitmentAiDto;
  /** 選んでいるタブか（選んでいなければ hidden） */
  readonly selected: boolean;
  /** 採用向けのタブへ焦点を移す（preventScroll: マウスで押したときは画面を動かさない） */
  readonly focusTab: (options: { readonly preventScroll: boolean }) => void;
}) {
  const gen = useAiGeneration(props.resultId, "recruitment", props.initial);
  const { state } = gen;
  const parts = panelParts("recruitment", {
    status: state.status,
    busy: gen.busy !== "idle",
    pollingTimedOut: gen.pollingTimedOut,
  });

  const onGenerate = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget;
    const focused = document.activeElement === button;
    const keyboard = focused && button.matches(":focus-visible");
    if (gen.generate() && focused) props.focusTab({ preventScroll: !keyboard });
  };

  return (
    <div
      className="ai-panel"
      id="ai-panel-recruitment"
      role="tabpanel"
      aria-labelledby="ai-tab-recruitment"
      hidden={!props.selected}
      data-status={state.status}
    >
      {parts.intro || parts.failure || parts.button ? (
        <div className="ai-start">
          {parts.intro ? <AiIntro kind="recruitment" /> : null}
          {parts.failure ? (
            <AiFailureNotice text={`${AI_TEXTS.failed}${aiFailureText(state.error)}`} />
          ) : null}
          {parts.button ? (
            <AiGenerateButton
              kind="recruitment"
              enabled={state.enabled}
              disabled={gen.locked}
              onClick={onGenerate}
            />
          ) : null}
        </div>
      ) : null}
      {parts.generating ? <AiGenerating /> : null}
      {parts.timeout ? <AiFailureNotice text={AI_TEXTS.pollingTimeout} /> : null}
      {parts.view && state.latest !== null ? (
        <RecruitmentView output={state.latest.output} />
      ) : null}
    </div>
  );
}

"use client";
// 育成・定着のパネル（11-6 §2.5。§2.3.5 の表）。useAiGeneration(…, "training") の状態と panelParts で、上から生成の入口
// （.ai-start.ai-start--training: 案内 → 8 項目の入力欄 → 失敗の枠 → 生成ボタン。生成済みのときは 8 項目だけ）、生成中（10 分たっても
// 終わらなければ、代わりに T-29 の失敗の枠）、表示（TrainingView）を出す。選んでいないときは hidden で隠す（8 項目の選択と読み直しを
// 失わない。§2.1）。data-status は今の状態（E2E が待ち合わせに使う。見た目に関わらない）。
// 8 項目（§2.5.3）: 選んだ値（下書き）はこのパネルが持つ。初めは保存した値（生成済みのとき。それ以外は未選択）で、生成に失敗しても
// この画面で選んだ値を残す（再読み込みで未選択に戻る）。生成済みの表示では、保存した値（state.context）を選べない状態で出す。生成中も
// 選べない（K-20 (3)）。種類が有効でない（本番で確認の前。§2.7.4）ときも 8 項目は選べ、生成ボタンだけが押せない（§2.3.2 の準備中）。
// 生成ボタンを押したとき（§2.5.4）:
// - 未選択の欄がある: その欄すべてを不正の表示（aria-invalid）にし、最初の未選択の欄に焦点を移して、生成を始めない。キーボードで押した
//   ときは選択欄が :focus-visible になって不正のときの焦点の枠が出て、留まった目次の下に入れば ResultToc の focusin の処理が目次の下へ
//   動かす。選び直して値が空でなくなった欄は、不正の表示を消す。
// - 8 つそろっている: 要求の本文 { context } で生成を始める（§3.4）。生成ボタンは生成を始めるとすぐ消える（§2.3.2）ので、焦点のある
//   生成ボタンを押したら、ボタンが消える前に選んでいるタブへ焦点を移す（body に落とさない。採用向けと同じ。キーボードで押したときは
//   タブに焦点の枠が出て、マウスで押したときは画面を動かさない）。生成の完了・失敗のあとも焦点はタブのまま
import { useRef, useState, type MouseEvent } from "react";

import { AiFailureNotice } from "./AiFailureNotice";
import { AiGenerateButton } from "./AiGenerateButton";
import { AiGenerating } from "./AiGenerating";
import { AiIntro } from "./AiIntro";
import { TrainingContextForm, type TrainingContextSelectRefs } from "./TrainingContextForm";
import { TrainingView } from "./TrainingView";
import { useAiGeneration } from "./use-ai-generation";
import type { TrainingContextKey } from "@/lib/masters/training-context";
import {
  panelParts,
  trainingContextDraftOf,
  trainingContextFromDraft,
  unselectedTrainingContextKeys,
  type TrainingContextDraft,
} from "@/lib/presentation/ai-area";
import { AI_TEXTS, aiFailureText } from "@/lib/presentation/ai-texts";
import type { TrainingAiDto } from "@/lib/services/dto/ai";

const NO_INVALID: ReadonlySet<TrainingContextKey> = new Set();

export function TrainingPanel(props: {
  readonly resultId: string;
  readonly initial: TrainingAiDto;
  /** 選んでいるタブか（選んでいなければ hidden） */
  readonly selected: boolean;
  /** 育成・定着のタブへ焦点を移す（preventScroll: マウスで押したときは画面を動かさない） */
  readonly focusTab: (options: { readonly preventScroll: boolean }) => void;
}) {
  const gen = useAiGeneration(props.resultId, "training", props.initial);
  const { state } = gen;
  const parts = panelParts("training", {
    status: state.status,
    busy: gen.busy !== "idle",
    pollingTimedOut: gen.pollingTimedOut,
  });
  const [draft, setDraft] = useState<TrainingContextDraft>(() =>
    trainingContextDraftOf(props.initial.context),
  );
  const [invalid, setInvalid] = useState<ReadonlySet<TrainingContextKey>>(NO_INVALID);
  const selectRefs: TrainingContextSelectRefs = useRef<
    Partial<Record<TrainingContextKey, HTMLSelectElement | null>>
  >({});

  const onChange = (key: TrainingContextKey, code: string) => {
    setDraft((current) => ({ ...current, [key]: code }));
    if (code !== "") {
      setInvalid((current) => {
        if (!current.has(key)) return current;
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  const onGenerate = (event: MouseEvent<HTMLButtonElement>) => {
    const context = trainingContextFromDraft(draft);
    if (context === null) {
      const missing = unselectedTrainingContextKeys(draft);
      setInvalid(new Set(missing));
      const first = missing[0];
      if (first !== undefined) selectRefs.current[first]?.focus();
      return;
    }
    const button = event.currentTarget;
    const focused = document.activeElement === button;
    const keyboard = focused && button.matches(":focus-visible");
    if (gen.generate({ context }) && focused) props.focusTab({ preventScroll: !keyboard });
  };

  return (
    <div
      className="ai-panel"
      id="ai-panel-training"
      role="tabpanel"
      aria-labelledby="ai-tab-training"
      hidden={!props.selected}
      data-status={state.status}
    >
      <div className="ai-start ai-start--training">
        {parts.intro ? <AiIntro kind="training" /> : null}
        {parts.context !== null ? (
          <TrainingContextForm
            values={parts.context === "saved" ? trainingContextDraftOf(state.context) : draft}
            invalid={invalid}
            mode={parts.context}
            onChange={onChange}
            selectRefs={selectRefs}
          />
        ) : null}
        {parts.failure ? (
          <AiFailureNotice text={`${AI_TEXTS.failed}${aiFailureText(state.error)}`} />
        ) : null}
        {parts.button ? (
          <AiGenerateButton
            kind="training"
            enabled={state.enabled}
            disabled={gen.locked}
            onClick={onGenerate}
          />
        ) : null}
      </div>
      {parts.generating ? <AiGenerating /> : null}
      {parts.timeout ? <AiFailureNotice text={AI_TEXTS.pollingTimeout} /> : null}
      {parts.view && state.latest !== null ? <TrainingView output={state.latest.output} /> : null}
    </div>
  );
}

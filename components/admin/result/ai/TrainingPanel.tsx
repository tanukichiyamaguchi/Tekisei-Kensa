"use client";
// 育成・定着のパネル（11-6 §2.5。PR-7.9 の形）。PR-7.9 は育成・定着を生成できない（有効でない種類。API の生成の要求も 503
// AI_KIND_DISABLED）ので、生成の入口（.ai-start.ai-start--training）に案内（§2.5.2）と押せない生成ボタン、その下の「この AI 解説は
// 準備中です。」（§2.3.2）だけを出す。8 項目の入力欄（§2.5.3）・生成中・失敗の枠・表示（§2.5.5）と、useAiGeneration・panelParts で
// 部品を選ぶ形は PR-7.10 が足す。選んでいないときは hidden で隠す。data-status は今の状態（E2E が使う。見た目に関わらない）
import { AiGenerateButton } from "./AiGenerateButton";
import { AiIntro } from "./AiIntro";
import type { TrainingAiDto } from "@/lib/services/dto/ai";

export function TrainingPanel(props: {
  readonly initial: TrainingAiDto;
  /** 選んでいるタブか（選んでいなければ hidden） */
  readonly selected: boolean;
}) {
  return (
    <div
      className="ai-panel"
      id="ai-panel-training"
      role="tabpanel"
      aria-labelledby="ai-tab-training"
      hidden={!props.selected}
      data-status={props.initial.status}
    >
      <div className="ai-start ai-start--training">
        <AiIntro kind="training" />
        <AiGenerateButton kind="training" enabled={false} />
      </div>
    </div>
  );
}

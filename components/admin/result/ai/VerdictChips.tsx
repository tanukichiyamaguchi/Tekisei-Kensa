// 採用向けの判定チップ 3 つ（11-6 §2.4.3 の 5・§2.4.4。K-39 Q-28。見た目は別表C の .verdict・.vchip）。順は即戦力性 → 離職リスク →
// 総合判定（RECRUITMENT_CHIP_ORDER）。チップのクラスは recruitmentChipTone の色の段階（good・warn・mid・bad）で、値の前の点は参照元の
// 4 色、値の文字は K-49 の色（別表C の C.4）。点は値に添えた印で読み上げない。値が空の文字のときは「-」（mid）。値は React の文字
// として出す（K-31 ⑤）。フックを使わないので Server でも描ける
import type { AiAnalysisOutput } from "@/lib/ai/types";
import { RECRUITMENT_CHIP_ORDER, recruitmentChipTone } from "@/lib/presentation/ai-area";
import { AI_TEXTS } from "@/lib/presentation/ai-texts";

export function VerdictChips(props: { readonly verdict: AiAnalysisOutput["verdict"] }) {
  const t = AI_TEXTS.recruitmentView;
  return (
    <div className="verdict">
      {RECRUITMENT_CHIP_ORDER.map((kind) => {
        const value: string = props.verdict[kind];
        return (
          <div key={kind} className={`vchip ${recruitmentChipTone(kind, value)}`}>
            <p className="vk">{t.chips[kind]}</p>
            <p className="vv">
              <span className="vdot" aria-hidden="true" />
              {value === "" ? t.empty : value}
            </p>
          </div>
        );
      })}
    </div>
  );
}

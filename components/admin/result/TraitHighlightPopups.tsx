"use client";
// ほかの特性が高い／低い場合の 2 つのポップアップ（11-4 §2.15。今の TraitListDialog「項目一覧」を置き換える）。概要のカード 1・2 の
// ボタンで開く。どちらも 16 行を項目順に、列「項目」「ポジティブな面」「ネガティブな面」で出す（値・強調・並び替えは無い）。
// 文は TRAIT_HIGHLIGHT_TEXTS（付録C §3）で、大きい場合の適応力のネガティブな面は「個性が弱い、主体性がない」（K-32 ⑩）。
// components/ui/Dialog を className="rd-pop" で使い（見た目は別表D の 16）、閉じるボタンは × の線のアイコン、閉じるボタン・Esc・背景で
// 閉じ、開いたボタンに焦点を戻す。表の入れ物がはみ出して動く間だけ焦点を受ける（bodyRegionLabel。scrollable-region-focusable）。
// #rs2 の外に描く（#rs2 button:focus-visible が共通の焦点の枠に勝たないように。§2.2）
import { ResultIcon } from "./result-icons";
import { Dialog } from "@/components/ui/Dialog";
import { RESULT_DETAIL_TEXTS } from "@/lib/presentation/result-detail-texts";
import type { ResultDetailView } from "@/lib/presentation/result-detail-view";

export type TraitHighlightSide = "high" | "low";

function PopupTable(props: {
  readonly traits: ResultDetailView["traits"];
  readonly side: TraitHighlightSide;
}) {
  const t = RESULT_DETAIL_TEXTS.popup;
  const high = props.side === "high";
  return (
    <div className="rd-pop-table">
      <table>
        <thead>
          <tr>
            <th scope="col" className="c-item">
              {t.item}
            </th>
            <th scope="col" className="c-pos">
              {t.positive}
            </th>
            <th scope="col" className="c-neg">
              {t.negative}
            </th>
          </tr>
        </thead>
        <tbody>
          {props.traits.map((trait) => (
            <tr key={trait.key}>
              <td className="c-item">{trait.label}</td>
              <td className="c-pos">{high ? trait.highPositive : trait.lowPositive}</td>
              <td className="c-neg">{high ? trait.highNegative : trait.lowNegative}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TraitHighlightPopups(props: {
  /** 項目順の 16 件 */
  readonly traits: ResultDetailView["traits"];
  /** 開いているポップアップ（null はどちらも閉じている） */
  readonly open: TraitHighlightSide | null;
  readonly onClose: () => void;
}) {
  const t = RESULT_DETAIL_TEXTS.popup;
  return (
    <>
      {(["high", "low"] as const).map((side) => {
        const title = side === "high" ? t.high : t.low;
        return (
          <Dialog
            key={side}
            open={props.open === side}
            title={title}
            onClose={props.onClose}
            className="rd-pop"
            closeIcon={<ResultIcon name="close" />}
            bodyRegionLabel={title}
          >
            <PopupTable traits={props.traits} side={side} />
          </Dialog>
        );
      })}
    </>
  );
}

// AI 解説の領域のアイコン（11-6 §2.14・別表D。K-05）。参照元の文字の記号「✦」・絵文字（グラフ・人・吹き出し・稲妻・芽）・Ionic の
// sparkles・プルダウンの矢印の代わりに描く自作の SVG で、形は自作（参照元の形は写していない）。どれも viewBox 0 0 24 24・幅と高さ 1em
// （大きさは置き場所の font-size。別表C の .ai-ico）・読み上げない（aria-hidden）・クラス ai-ico。線のアイコンは文字の色の線（端と角は
// 丸）、塗りのアイコン（SparkIcon・ZapIcon）は文字の色の塗りで、色は置き場所の文字の色（稲妻と芽は ai-ico--zap・ai-ico--sprout の
// クラスで色を付ける。style の属性は使わない）。path の d は別表D の値のまま。フックを使わないので Server でも Client でも描ける。
// 名前を付けて export し、11-8 のお知らせ（PR-7.16）も使う。ChevronDownIcon は育成・定着の 8 項目の選択欄（TrainingContextForm）が使い、
// svg 自身にクラス ai-chev も付ける（別表C の #ai .ai-ctx .ai-chev で、選択欄の右に縦の中央でそろえる）
import type { ReactNode } from "react";

/** 線のアイコン（別表D の「線」。線の幅は 1.5 か 2） */
function LineIcon(props: {
  readonly strokeWidth: number;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={props.className ?? "ai-ico"}
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {props.children}
    </svg>
  );
}

/** 塗りのアイコン（別表D の「塗り」） */
function FillIcon(props: { readonly className?: string; readonly children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      aria-hidden="true"
      className={props.className ?? "ai-ico"}
      fill="currentColor"
    >
      {props.children}
    </svg>
  );
}

/** 4 つ角の星（「✦」の代わり）。案内の四角・生成中の中央・見出し帯 */
export function SparkIcon() {
  return (
    <FillIcon>
      <path d="M12 2 C12.6 7.6 16.4 11.4 22 12 C16.4 12.6 12.6 16.4 12 22 C11.4 16.4 7.6 12.6 2 12 C7.6 11.4 11.4 7.6 12 2 Z" />
    </FillIcon>
  );
}

/** 大小 3 つの星の線（Ionic の sparkles の代わり）。タブ・生成ボタン */
export function SparklesIcon() {
  return (
    <LineIcon strokeWidth={1.5}>
      <path d="M9 5.5 L10.5 10.5 L15.5 12 L10.5 13.5 L9 18.5 L7.5 13.5 L2.5 12 L7.5 10.5 Z" />
      <path d="M17.5 2.5 L18.3 4.7 L20.5 5.5 L18.3 6.3 L17.5 8.5 L16.7 6.3 L14.5 5.5 L16.7 4.7 Z" />
      <path d="M18 13.5 L18.6 15.4 L20.5 16 L18.6 16.6 L18 18.5 L17.4 16.6 L15.5 16 L17.4 15.4 Z" />
    </LineIcon>
  );
}

/** 棒グラフ（絵文字のグラフの代わり）。採用向けの案内の特徴 1 */
export function ChartIcon() {
  return (
    <LineIcon strokeWidth={2}>
      <path d="M4 20 L20 20" />
      <path d="M7 16 L7 11" />
      <path d="M12 16 L12 7" />
      <path d="M17 16 L17 13" />
    </LineIcon>
  );
}

/** 人（絵文字の人の代わり）。採用向けの案内の特徴 2 */
export function UserIcon() {
  return (
    <LineIcon strokeWidth={2}>
      <path d="M12 4 A4 4 0 1 1 11.99 4 Z" />
      <path d="M4 20 C4 16 7.6 14 12 14 C16.4 14 20 16 20 20" />
    </LineIcon>
  );
}

/** 吹き出し（絵文字の吹き出しの代わり）。採用向けと育成・定着の案内の特徴 3 */
export function ChatIcon() {
  return (
    <LineIcon strokeWidth={2}>
      <path d="M4 5 H20 A1 1 0 0 1 21 6 V15 A1 1 0 0 1 20 16 H10 L6 20 V16 H4 A1 1 0 0 1 3 15 V6 A1 1 0 0 1 4 5 Z" />
    </LineIcon>
  );
}

/** 稲妻（絵文字の稲妻の代わり）。育成・定着の案内の特徴 1（色は .ai-ico--zap） */
export function ZapIcon() {
  return (
    <FillIcon className="ai-ico ai-ico--zap">
      <path d="M13 2 L4 14 H11 L10 22 L20 9 H13 Z" />
    </FillIcon>
  );
}

/** 芽（絵文字の芽の代わり）。育成・定着の案内の特徴 2（色は .ai-ico--sprout） */
export function SproutIcon() {
  return (
    <LineIcon strokeWidth={2} className="ai-ico ai-ico--sprout">
      <path d="M12 21 V11" />
      <path d="M12 13 C12 9 9 6 4 6 C4 11 7 13 12 13 Z" />
      <path d="M12 11 C12 7.5 14.5 5 19 5 C19 9 16.5 11 12 11 Z" />
    </LineIcon>
  );
}

/**
 * 下向きの山形（プルダウンの矢印の代わり）。育成・定着の 8 項目の選択欄。クラス ai-chev は svg 自身に付ける（別表C の .ai-chev は
 * absolute・top 50%・margin-top -6px・font-size 12px で、高さ 1em（12px）の svg がちょうど選択欄の縦の中央に来る。span で包むと、
 * 包んだ要素の高さが行の高さになって中央からずれる）
 */
export function ChevronDownIcon() {
  return (
    <LineIcon strokeWidth={2} className="ai-ico ai-chev">
      <path d="M6 9 L12 15 L18 9" />
    </LineIcon>
  );
}

// 回答一覧の線のアイコン（11-2 §2.26 のアイコンの表）。形は参照元の ad-app と同じで、自作の SVG。
// 表示 16px（i だけ 13px）、viewBox 0 0 24 24、線の色は文字の色、線の太さ 2、線の端と角は丸、塗りなし。読み上げない
import type { ReactNode } from "react";

function LineIcon({
  size = 16,
  children,
}: {
  readonly size?: number;
  readonly children: ReactNode;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 時計（利用履歴、入社日・退職日を入れる） */
export function ClockIcon() {
  return (
    <LineIcon>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </LineIcon>
  );
}

/** リンク（回答リンクをコピー） */
export function LinkIcon() {
  return (
    <LineIcon>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </LineIcon>
  );
}

/** 虫めがね（検索欄） */
export function SearchIcon() {
  return (
    <LineIcon>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </LineIcon>
  );
}

/** 縦の 3 点（⋮。塗りの円 3 つ、線なし） */
export function DotsIcon() {
  return (
    <LineIcon>
      <circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.8" fill="currentColor" stroke="none" />
    </LineIcon>
  );
}

/** i（集計から除外の列の見出し。表示 13px） */
export function InfoIcon() {
  return (
    <LineIcon size={13}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </LineIcon>
  );
}

/** 下向きの山（回答リンクをコピー。オーナー） */
export function ChevronDownIcon() {
  return (
    <LineIcon>
      <path d="M6 9l6 6 6-6" />
    </LineIcon>
  );
}

/** ファイル（以前の受験の項目） */
export function FileIcon() {
  return (
    <LineIcon>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <path d="M14 3v6h6" />
    </LineIcon>
  );
}

/** ごみ箱（この受験を削除） */
export function TrashIcon() {
  return (
    <LineIcon>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
    </LineIcon>
  );
}

// 組織内分類のアイコン（11-3 §2.22）。参照元はアイコンのライブラリの画像で、アプリは自作の SVG（K-05）。
// viewBox 0 0 24 24、線の色は文字の色、線の太さ 2、線の端は丸、塗りなし。読み上げない（ボタンの aria-label で読む）。
// 詳細パネルの「×」と「組織内分類とは？」の「?」は文字で描く（参照元もパネルは文字の「×」）

/** ×（「組織内分類とは」の閉じるボタン。28px） */
export function CloseIcon() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

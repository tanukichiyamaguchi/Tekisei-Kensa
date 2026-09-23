"use client";
// 保存中・送信中の全面オーバーレイ（05 §3、§7.2）。背後の操作を防ぐ
export function BusyOverlay({ text }: { readonly text: string }) {
  return (
    <div className="exam-busy" role="status" aria-live="polite" data-testid="busy-overlay">
      {text}
    </div>
  );
}

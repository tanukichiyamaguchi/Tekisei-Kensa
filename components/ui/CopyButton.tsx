"use client";
// コピーボタン（06 §3.7）。失敗時は対象の入力欄を選択状態にして手動コピーを促す
import { useToast } from "@/components/ui/Toast";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";

export function CopyButton(props: {
  readonly text: string;
  readonly targetId: string;
  readonly label: string;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      className="btn"
      aria-label={`${props.label}を${ADMIN_TEXTS.copy}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(props.text);
          toast.show(ADMIN_TEXTS.copied);
        } catch {
          const input = document.getElementById(props.targetId);
          if (input instanceof HTMLInputElement) {
            input.focus();
            input.select();
          }
          toast.show(ADMIN_TEXTS.copyFailed, "error");
        }
      }}
    >
      {ADMIN_TEXTS.copy}
    </button>
  );
}

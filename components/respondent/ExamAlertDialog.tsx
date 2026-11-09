"use client";
// R-07 エラーの通知（11-1 §2.1.5）。共用の通知の部品 SweetAlert（11-8 §2.12.4）をアイコンなしで包む。
// 見出しは R7-01「エラー」、本文は R-07 の文言の ID。同時に 1 つだけで、表示中に次が来たら中身を差し替えて数え直す。
// .exam-root の中（呼び出した画面の部品の中）に描くので、受験者側の変数と exam.css の指定が効く
import { SweetAlert } from "@/components/ui/SweetAlert";
import { EXAM_TEXTS, type ExamBannerTextId } from "@/lib/presentation/exam-texts";

export interface ExamAlertDialogProps {
  /** 出す本文の ID。null なら出さない */
  readonly textId: ExamBannerTextId | null;
  /** 消え終わったときに呼ぶ（呼び出し側は textId を null に戻す） */
  readonly onClose: () => void;
}

export function ExamAlertDialog({ textId, onClose }: ExamAlertDialogProps) {
  return (
    // 包むだけの要素（箱を作らない）。E2E はこの中の alertdialog を見る
    <div className="exam-alert-host" data-testid="alert-dialog">
      <SweetAlert
        open={textId !== null}
        title={EXAM_TEXTS["R7-01"]}
        text={textId === null ? "" : EXAM_TEXTS[textId]}
        onClose={onClose}
        className="exam-alert"
      />
    </div>
  );
}

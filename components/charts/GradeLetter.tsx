// 評価レター（V-05。06 §6.7）。null は比較未選択（固定文言 T-04）
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { gradeColor } from "@/lib/presentation/colors";
import type { Grade } from "@/lib/scoring/types";

export interface GradeLetterProps {
  readonly grade: Grade | null;
}

export function GradeLetter({ grade }: GradeLetterProps) {
  if (grade === null) {
    return <p className="grade-letter__placeholder">{ADMIN_TEXTS.comparisonRequired}</p>;
  }
  return (
    <span
      className="grade-letter"
      style={{ color: gradeColor(grade) }}
      aria-label={`評価 ${grade}`}
    >
      {grade}
    </span>
  );
}

// 受検者画面の共通レイアウト（05 §2.6、§3）。スタイルは exam.css（05 §2.5 のトークン）
import type { ReactNode } from "react";

import { ExamShell } from "@/components/respondent/ExamShell";

import "./exam.css";

export default function RespondentLayout({ children }: { readonly children: ReactNode }) {
  return <ExamShell>{children}</ExamShell>;
}

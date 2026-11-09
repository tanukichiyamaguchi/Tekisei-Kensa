// 受験者側の画面の共通レイアウト（11-1 §2.1）。書体 Inter の 400・500・600 を同梱の @fontsource/inter から読み、
// そのあとに受験者側のスタイル exam.css（11-1 §2.1.3 のトークン）を読む。実行時に外部（Google Fonts）へ取りに行かない
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";

import type { ReactNode } from "react";

import { ExamShell } from "@/components/respondent/ExamShell";

import "./exam.css";

export default function RespondentLayout({ children }: { readonly children: ReactNode }) {
  return <ExamShell>{children}</ExamShell>;
}

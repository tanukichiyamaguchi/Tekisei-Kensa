"use client";
// Server Component での予期しない例外（05 §5.6 unexpected）。例外の内容は表示しない（01 §8.6）
import { ExamErrorView } from "@/components/respondent/ExamErrorView";

export default function ExamError() {
  return <ExamErrorView kind="unexpected" />;
}

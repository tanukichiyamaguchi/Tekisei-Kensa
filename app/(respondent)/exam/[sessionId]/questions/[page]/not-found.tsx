// ページ番号が 1〜20 の整数でない（05 §5.6 page_not_found）
import { ExamErrorView } from "@/components/respondent/ExamErrorView";

export default function PageNotFound() {
  return <ExamErrorView kind="page_not_found" />;
}

// /exam の notFound()（q・p の不正、組織なし・削除済み）。05 §5.6 organization_not_found
import { ExamErrorView } from "@/components/respondent/ExamErrorView";

export default function OrganizationNotFound() {
  return <ExamErrorView kind="organization_not_found" />;
}

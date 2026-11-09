// R-01 受験者登録（11-1 §2.2）。/exam?q={organizationId}&p=user|executives
import { renderRegistrationPage, type RegistrationSearchParams } from "../registration-page";

export default function RegistrationPage({
  searchParams,
}: {
  readonly searchParams: RegistrationSearchParams;
}) {
  return renderRegistrationPage("/exam", searchParams);
}

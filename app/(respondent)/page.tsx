// R-01 受験者登録（11-1 §2.2）。サイトのトップ / にも /exam と同じ画面を出す（参照元の受験者登録はサイトのトップ）
import { renderRegistrationPage, type RegistrationSearchParams } from "./registration-page";

export default function TopPage({
  searchParams,
}: {
  readonly searchParams: RegistrationSearchParams;
}) {
  return renderRegistrationPage("/", searchParams);
}

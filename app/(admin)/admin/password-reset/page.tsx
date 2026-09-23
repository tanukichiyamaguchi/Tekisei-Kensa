// M-03 パスワード再設定（06 §3.3）。メールのリンクは ?mode=resetPassword&oobCode=…
import { AuthCard } from "@/components/admin/AuthCard";
import { PasswordResetForm } from "@/components/admin/auth/PasswordResetForm";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PasswordResetPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const params = await searchParams;
  const oobCode =
    params.mode === "resetPassword" && typeof params.oobCode === "string" && params.oobCode !== ""
      ? params.oobCode
      : null;
  return (
    <AuthCard title="パスワードの設定">
      <PasswordResetForm oobCode={oobCode} />
    </AuthCard>
  );
}

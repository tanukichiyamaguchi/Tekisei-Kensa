// M-02 管理者サインアップ（06 §3.2）。招待トークンを事前検証し、無効・欠落なら案内（T-22）だけを出す
import { AuthCard } from "@/components/admin/AuthCard";
import { SignupForm } from "@/components/admin/auth/SignupForm";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { validateInviteToken } from "@/lib/services/invite-acceptance";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SignupPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const params = await searchParams;
  const token = typeof params.q === "string" ? params.q : null;
  const invite = token ? await validateInviteToken(token) : null;
  return (
    <AuthCard title="管理者の登録">
      {token && invite ? (
        <SignupForm inviteToken={token} organizationName={invite.organizationName} />
      ) : (
        <p className="notice notice--error" role="alert">
          {ADMIN_TEXTS.inviteInvalid}
        </p>
      )}
    </AuthCard>
  );
}

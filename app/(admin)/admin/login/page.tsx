// M-01 ログイン（06 §3.1）。有効なセッション Cookie があれば /admin（または next）へ移る
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthCard } from "@/components/admin/AuthCard";
import { LoginForm } from "@/components/admin/auth/LoginForm";
import { sessionCookieName, verifyAdminSessionCookie } from "@/lib/auth/session-cookie";
import { safeNextPath } from "@/lib/presentation/admin-navigation";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const single = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? undefined : v;

export default async function LoginPage({ searchParams }: { readonly searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(single(params.next));
  const cookie = (await cookies()).get(sessionCookieName())?.value;
  if (cookie && (await verifyAdminSessionCookie(cookie))) redirect(next);
  return (
    <AuthCard title="管理画面ログイン">
      <LoginForm next={next} reset={single(params.reset) === "1"} />
    </AuthCard>
  );
}

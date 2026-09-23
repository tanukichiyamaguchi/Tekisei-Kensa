// M-07 アカウント（06 §3.7）。管理者一覧は owner / super_admin のときだけ Server Component で取得する
import { renderAdminPage } from "@/components/admin/admin-page";
import { AccountPage } from "@/components/admin/account/AccountPage";
import { canManageOrganization } from "@/lib/auth/claims";
import { listAdminUsers } from "@/lib/services/admin-account";

export default async function AccountRoute() {
  return renderAdminPage({
    path: "/admin/account",
    current: "account",
    render: async (ctx, me) => {
      const adminUsers = canManageOrganization(ctx.role) ? await listAdminUsers(ctx) : null;
      return <AccountPage me={me} adminUsers={adminUsers} />;
    },
  });
}

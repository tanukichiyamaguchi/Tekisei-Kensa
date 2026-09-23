// 役割の表示名（06 §10.1）。Client Component から使うため lib/presentation に置き、lib/auth/admin-role.ts はこれを再エクスポートする
import type { AdminRole } from "@/lib/db/types";

export const ADMIN_ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  owner: "オーナー",
  admin: "管理者",
  super_admin: "スーパーアドミン",
} as const;

// 役割の表示用ヘルパー（06 §10.1）。判定関数の実体は lib/auth/claims.ts（02 §9.2）で、ここでは再定義しない
import type { AdminRole } from "@/lib/db/types";

export { canViewExecutives } from "@/lib/auth/claims";

export const ADMIN_ROLE_LABELS: Readonly<Record<AdminRole, string>> = {
  owner: "オーナー",
  admin: "管理者",
  super_admin: "スーパーアドミン",
} as const;

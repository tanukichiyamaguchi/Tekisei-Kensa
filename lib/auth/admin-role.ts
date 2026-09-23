// 役割の表示用ヘルパー（06 §10.1）。判定関数の実体は lib/auth/claims.ts（02 §9.2）で、ここでは再定義しない
export { canViewExecutives } from "@/lib/auth/claims";
export { ADMIN_ROLE_LABELS } from "@/lib/presentation/admin-roles";

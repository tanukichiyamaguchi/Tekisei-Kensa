// 認可 3 段階の (3) と幹部可視性（04 §5 冒頭、D04-07）。満たさなければ 404（存在を見せない）
import type { ApiError } from "./errors";
import type { AdminContext } from "@/lib/auth/admin-context";
import type { RespondentKind } from "@/lib/db/types";

export interface VisibleDocument {
  readonly organizationId: string;
  readonly deletedAt: Date | null;
  /** respondents.kind または results.respondentKind（無ければ幹部判定をしない） */
  readonly kind?: RespondentKind;
}

export function assertVisibleToAdmin(
  ctx: Pick<AdminContext, "organizationId" | "canViewExecutives">,
  doc: VisibleDocument | null,
  notFound: () => ApiError,
): asserts doc is VisibleDocument {
  if (
    doc === null ||
    doc.organizationId !== ctx.organizationId ||
    doc.deletedAt !== null ||
    (doc.kind === "executive" && !ctx.canViewExecutives)
  ) {
    throw notFound();
  }
}

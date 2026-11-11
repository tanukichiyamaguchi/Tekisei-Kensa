// M-08 在籍・退職（11-3 §2.1・§3.8）。サーバで getEmployment（GET /api/v1/admin/employment と同じ EmploymentDto。組織内分類と同じ人
// （同じ人の受験は代表の受験で数え、除外した受験は数えず、オーナー以外には既存スタッフを入れない。11-3 §2.2）と基準日）を呼び、
// 画面の本体 EmploymentView に渡す。URL のクエリは読まない（11-3 §2.1）。取得に失敗したとき（503 SERVICE_UNAVAILABLE・500 ほか）は
// ログに残し（個人情報なし）、見出しの位置に取得の失敗の文言だけを出す
import { renderAdminPage } from "@/components/admin/admin-page";
import { EmploymentView } from "@/components/admin/employment/EmploymentView";
import { getEmployment } from "@/lib/services/classification";
import type { EmploymentDto } from "@/lib/services/dto/admin";
import { errorFields, logger } from "@/lib/utils/logger";

export default async function EmploymentPage() {
  return renderAdminPage({
    path: "/admin/employment",
    current: "employment",
    render: async (ctx) => {
      let initial: EmploymentDto | null;
      try {
        initial = await getEmployment(ctx);
      } catch (error) {
        logger.error("employment.load_failed", {
          requestId: ctx.request.requestId,
          ...errorFields(error),
        });
        initial = null;
      }
      return <EmploymentView initial={initial} />;
    },
  });
}

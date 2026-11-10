// M-06 組織内分類（11-3 §2.1・§3.8）。サーバで getClassification（GET /api/v1/admin/classification と同じ ClassificationDto。同じ人の
// 受験は代表の受験で数え、除外した受験は数えず、オーナー以外には既存スタッフを入れない。11-3 §2.2）を呼び、画面の本体
// ClassificationView に渡す。URL のクエリは読まない（11-3 §2.1）。取得に失敗したとき（503 SERVICE_UNAVAILABLE・500 ほか）は
// ログに残し（個人情報なし）、見出し行の下に取得の失敗の文言だけを出す
import { renderAdminPage } from "@/components/admin/admin-page";
import { ClassificationView } from "@/components/admin/classification/ClassificationView";
import { getClassification } from "@/lib/services/classification";
import type { ClassificationDto } from "@/lib/services/dto/admin";
import { errorFields, logger } from "@/lib/utils/logger";

export default async function ClassificationPage() {
  return renderAdminPage({
    path: "/admin/classification",
    current: "classification",
    render: async (ctx) => {
      let initial: ClassificationDto | null;
      try {
        initial = await getClassification(ctx);
      } catch (error) {
        logger.error("classification.load_failed", {
          requestId: ctx.request.requestId,
          ...errorFields(error),
        });
        initial = null;
      }
      return <ClassificationView initial={initial} />;
    },
  });
}

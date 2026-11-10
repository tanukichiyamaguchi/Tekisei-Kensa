// M-04 回答一覧（11-2 §2.1・§3.12）。サーバで listResultRows（GET /api/v1/admin/results と同じ ResultListDto）を呼び、一覧の本体
// ResultsView に渡す。URL のクエリは読まない（絞り込みの状態は画面と sessionStorage。11-2 §2.21）。取得に失敗したとき
// （503 SERVICE_UNAVAILABLE・500 ほか）はログに残し（個人情報なし）、一覧の代わりに取得の失敗の文言を出す
import { renderAdminPage } from "@/components/admin/admin-page";
import { ResultsView } from "@/components/admin/ResultsView";
import type { ResultListDto } from "@/lib/services/dto/admin";
import { listResultRows } from "@/lib/services/result-list";
import { errorFields, logger } from "@/lib/utils/logger";

export default async function ResultsPage() {
  return renderAdminPage({
    path: "/admin",
    current: "results",
    render: async (ctx, me) => {
      let initial: ResultListDto | null;
      try {
        initial = await listResultRows(ctx);
      } catch (error) {
        logger.error("result_list.load_failed", {
          requestId: ctx.request.requestId,
          ...errorFields(error),
        });
        initial = null;
      }
      return (
        <ResultsView
          initial={initial}
          canViewExecutives={me.canViewExecutives}
          organizationName={me.organization.name}
          links={{ applicant: me.links.applicant, executive: me.links.executive }}
        />
      );
    },
  });
}

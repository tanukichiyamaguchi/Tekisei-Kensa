// M-04 回答一覧（06 §3.4）。/admin?q=&kind=&teamCode=&sort=&order=&page=
import { renderAdminPage } from "@/components/admin/admin-page";
import { ResultsView } from "@/components/admin/ResultsView";
import { resultListHref, type ResultListUrlState } from "@/lib/presentation/admin-navigation";
import { listResults } from "@/lib/services/result-list";
import { listResultsQuerySchema } from "@/lib/services/schemas/admin-results";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** URL クエリ → 一覧の条件。不正な値は既定値に戻す（画面は壊さない） */
function parseState(params: Record<string, string | string[] | undefined>): ResultListUrlState {
  const flat = Object.fromEntries(
    Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
  const parsed = listResultsQuerySchema.safeParse(flat);
  const query = parsed.success ? parsed.data : listResultsQuerySchema.parse({});
  return {
    q: query.q === "" ? undefined : query.q,
    kind: query.kind,
    teamCode: query.teamCode,
    sort: query.sort === "name" ? "name" : "submittedAt",
    order: query.order,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export default async function ResultsPage({
  searchParams,
}: {
  readonly searchParams: SearchParams;
}) {
  const state = parseState(await searchParams);
  const path = resultListHref(state);
  return renderAdminPage({
    path,
    current: "results",
    render: async (ctx) => {
      const data = await listResults(ctx, { ...state, excluded: "all" });
      // URL が変わったとき（検索・ページ移動）と再取得（router.refresh）で内容が変わったときに一覧の状態を作り直す
      const key = `${path}#${data.total}#${data.items.map((i) => i.resultId).join(",")}`;
      return (
        <ResultsView
          key={key}
          data={data}
          state={state}
          canViewExecutives={ctx.canViewExecutives}
        />
      );
    },
  });
}

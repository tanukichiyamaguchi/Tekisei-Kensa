// M-06 組織内分類（06 §3.6）。除外者を含めて数える（includeExcluded の既定 true。06 D06-18）
import { renderAdminPage } from "@/components/admin/admin-page";
import { ClassificationMatrix } from "@/components/admin/classification/ClassificationMatrix";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { getClassification } from "@/lib/services/classification";

export default async function ClassificationPage() {
  return renderAdminPage({
    path: "/admin/classification",
    current: "classification",
    render: async (ctx) => {
      const data = await getClassification(ctx, { includeExcluded: true });
      return (
        <>
          <h1>{ADMIN_TEXTS.nav.classification}</h1>
          <ClassificationMatrix data={data} />
        </>
      );
    },
  });
}

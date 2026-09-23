"use client";
// P-01 利用履歴（06 §3.4.7）。開くたびに GET /api/v1/admin/usage-logs（registeredAt 降順）を取得する
import { useEffect, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import { pageCount } from "@/lib/presentation/admin-navigation";
import type { PagedDto, UsageLogItemDto } from "@/lib/services/dto/admin";
import { AdminApiError, fetchUsageLogs } from "@/lib/utils/admin-api";

const PAGE_SIZE = 50;

type State =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: PagedDto<UsageLogItemDto> }
  | { readonly kind: "error"; readonly message: string };

export function UsageLogDialog(props: { readonly open: boolean; readonly onClose: () => void }) {
  const [page, setPage] = useState(1);
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!props.open) return;
    const controller = new AbortController();
    setState({ kind: "loading" });
    fetchUsageLogs({ page, pageSize: PAGE_SIZE })
      .then((data) => {
        if (!controller.signal.aborted) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          kind: "error",
          message: error instanceof AdminApiError ? error.message : ADMIN_TEXTS.networkError,
        });
      });
    return () => controller.abort();
  }, [props.open, page]);

  const title =
    state.kind === "ready"
      ? `${ADMIN_TEXTS.usageLogs}（全 ${state.data.total} 件）`
      : ADMIN_TEXTS.usageLogs;
  const pages = state.kind === "ready" ? pageCount(state.data.total, PAGE_SIZE) : 1;

  return (
    <Dialog
      open={props.open}
      title={title}
      wide
      onClose={() => {
        props.onClose();
        setPage(1);
      }}
      footer={
        pages > 1 ? (
          <div className="pager">
            <button
              type="button"
              className="btn"
              aria-disabled={page <= 1 ? "true" : undefined}
              onClick={() => page > 1 && setPage(page - 1)}
            >
              前へ
            </button>
            <span>
              {page} / {pages}
            </span>
            <button
              type="button"
              className="btn"
              aria-disabled={page >= pages ? "true" : undefined}
              onClick={() => page < pages && setPage(page + 1)}
            >
              次へ
            </button>
          </div>
        ) : null
      }
    >
      {state.kind === "loading" ? <p>読み込み中…</p> : null}
      {state.kind === "error" ? (
        <p className="notice notice--error" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <table className="data-table" data-testid="usage-log-table">
          <thead>
            <tr>
              <th scope="col">名前</th>
              <th scope="col">電話番号</th>
              <th scope="col">回答日時</th>
              <th scope="col">過去の診断経験</th>
              <th scope="col">登録日時</th>
            </tr>
          </thead>
          <tbody>
            {state.data.items.map((item) => (
              <tr key={item.usageLogId}>
                <td>{item.name}</td>
                <td className="data-table__nowrap">{item.phoneNumber}</td>
                <td className="data-table__nowrap">
                  {item.submittedAt ? formatDateTime(item.submittedAt) : ADMIN_TEXTS.notSubmitted}
                </td>
                <td>{ADMIN_TEXTS.diagnosisExperience[item.diagnosisExperience]}</td>
                <td className="data-table__nowrap">{formatDateTime(item.registeredAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </Dialog>
  );
}

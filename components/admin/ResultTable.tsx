"use client";
// M-04 の一覧テーブル（06 §3.4.2、§3.4.4、§3.4.5）。チーム・除外は即時 PATCH、失敗時は元の値に戻す
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { getOccupationLabel } from "@/lib/masters/occupations";
import { ADMIN_TEXTS, RESPONDENT_KIND_LABELS } from "@/lib/presentation/admin-texts";
import { TEAM_CODES, teamLabel } from "@/lib/presentation/comparison-scope-params";
import { formatDateTime } from "@/lib/presentation/format-datetime";
import type { ResultListItemDto } from "@/lib/services/dto/admin";
import { AdminApiError, deleteRespondent, updateRespondent } from "@/lib/utils/admin-api";

type Row = ResultListItemDto;

export function ResultTable(props: {
  readonly items: readonly Row[];
  readonly showKind: boolean;
  readonly onDeleted: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<readonly Row[]>(props.items);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const setBusy = (respondentId: string, busy: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (busy) next.add(respondentId);
      else next.delete(respondentId);
      return next;
    });

  async function patchRow(row: Row, patch: { teamCode?: string | null; isExcluded?: boolean }) {
    if (pending.has(row.respondentId)) return;
    setBusy(row.respondentId, true);
    // 先に画面へ反映し、失敗したら元に戻す
    setRows((prev) =>
      prev.map((r) => (r.respondentId === row.respondentId ? ({ ...r, ...patch } as Row) : r)),
    );
    try {
      const updated = await updateRespondent(row.respondentId, patch);
      setRows((prev) =>
        prev.map((r) =>
          r.respondentId === row.respondentId
            ? { ...r, teamCode: updated.teamCode, isExcluded: updated.isExcluded }
            : r,
        ),
      );
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.respondentId === row.respondentId ? row : r)));
      toast.show(e instanceof AdminApiError ? e.message : ADMIN_TEXTS.networkError, "error");
    } finally {
      setBusy(row.respondentId, false);
    }
  }

  async function confirmDelete() {
    if (!deleting || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteRespondent(deleting.respondentId);
      setRows((prev) => prev.filter((r) => r.respondentId !== deleting.respondentId));
      setDeleting(null);
      toast.show(ADMIN_TEXTS.deleted);
      props.onDeleted();
    } catch (e) {
      if (e instanceof AdminApiError && e.code === "RESPONDENT_NOT_FOUND") {
        // 別タブなどで既に削除済み（04 D04-30）
        setDeleting(null);
        toast.show(ADMIN_TEXTS.alreadyDeleted, "error");
        router.refresh();
      } else {
        setDeleteError(e instanceof AdminApiError ? e.message : ADMIN_TEXTS.networkError);
      }
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <>
      <table className="data-table" data-testid="result-table">
        <thead>
          <tr>
            <th scope="col">詳細</th>
            <th scope="col">お名前</th>
            {props.showKind ? <th scope="col">区分</th> : null}
            <th scope="col">チーム</th>
            <th scope="col">除外</th>
            <th scope="col">職業</th>
            <th scope="col">電話番号</th>
            <th scope="col">回答日時</th>
            <th scope="col">削除</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const busy = pending.has(row.respondentId);
            const detailHref = `/admin/results/${row.resultId}`;
            return (
              <tr key={row.resultId} data-result-id={row.resultId}>
                <td>
                  <Link className="icon-btn" href={detailHref} aria-label={`${row.name} の詳細`}>
                    ▤
                  </Link>
                </td>
                <td>
                  <Link href={detailHref}>{row.name}</Link>
                </td>
                {props.showKind ? <td>{RESPONDENT_KIND_LABELS[row.kind]}</td> : null}
                <td>
                  <select
                    aria-label={`${row.name} のチーム`}
                    value={row.teamCode ?? ""}
                    aria-disabled={busy ? "true" : undefined}
                    onChange={(e) =>
                      void patchRow(row, {
                        teamCode: e.target.value === "" ? null : e.target.value,
                      })
                    }
                  >
                    <option value="">{ADMIN_TEXTS.unassignedTeam}</option>
                    {TEAM_CODES.map((code) => (
                      <option key={code} value={code}>
                        {teamLabel(code)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="data-table__nowrap">
                  <label>
                    <input
                      type="checkbox"
                      checked={row.isExcluded}
                      aria-disabled={busy ? "true" : undefined}
                      onChange={(e) => void patchRow(row, { isExcluded: e.target.checked })}
                    />{" "}
                    {ADMIN_TEXTS.exclude}
                  </label>
                </td>
                <td>{getOccupationLabel(row.occupationCode)}</td>
                <td className="data-table__nowrap">{row.phoneNumber}</td>
                <td className="data-table__nowrap">{formatDateTime(row.submittedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="icon-btn icon-btn--danger"
                    aria-label={`${row.name} を削除`}
                    onClick={() => {
                      setDeleteError(null);
                      setDeleting(row);
                    }}
                  >
                    🗑
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <DeleteConfirmDialog
        target={deleting}
        busy={deleteBusy}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleting(null)}
      />
    </>
  );
}

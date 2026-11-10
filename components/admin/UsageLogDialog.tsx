"use client";
// P-01 利用履歴（11-2 §2.18）。回答一覧の見出しの「利用履歴」から開く（共通ヘッダーには置かない）。開くたびに
// GET /api/v1/admin/usage-logs で送信済みの全件を受け取り（閉じたら結果を捨てる）、回答日時の新しい順に 4 列で出す（ページ送りなし）。
// Esc・背景では閉じず、「閉じる」と右上の閉じるアイコンで閉じる。見た目は className の rl-popup・rl-usage（app/(admin)/admin.css）。
// 表は入れ物の中で動かし、ページは横に動かさない。入れ物がはみ出して動くときだけ焦点を受ける（tabIndex 0・role="region"・見出しと同じ
// 読み上げ名。axe の scrollable-region-focusable は動く入れ物だけを見る。11 総論 8.5）
import { useEffect, useRef, useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatUsageLogDateTime } from "@/lib/presentation/format-datetime";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";
import type { UsageLogListDto } from "@/lib/services/dto/admin";
import { AdminApiError, fetchUsageLogs } from "@/lib/utils/admin-api";

type State =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly data: UsageLogListDto }
  | { readonly kind: "error"; readonly message: string };

export function UsageLogDialog(props: {
  readonly open: boolean;
  /** 見出し「利用履歴（{組織名}）」の組織名（MeDto の組織名） */
  readonly organizationName: string;
  readonly onClose: () => void;
}) {
  const t = RESULT_LIST_TEXTS.usageLog;
  const title = t.title(props.organizationName);
  const [state, setState] = useState<State>({ kind: "loading" });
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    if (!props.open) {
      // 閉じたら結果を捨てる（開き直したときに前の結果を見せない）
      setState({ kind: "loading" });
      return;
    }
    let active = true;
    setState({ kind: "loading" });
    fetchUsageLogs()
      .then((data) => {
        if (active) setState({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          kind: "error",
          message: error instanceof AdminApiError ? error.message : ADMIN_TEXTS.networkError,
        });
      });
    return () => {
      active = false;
    };
  }, [props.open]);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box) {
      setScrollable(false);
      return;
    }
    const check = () =>
      setScrollable(box.scrollWidth > box.clientWidth || box.scrollHeight > box.clientHeight);
    check();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => observer.disconnect();
  }, [state]);

  // API は送信済みだけを返す（11-2 §3.3）。送信されていない履歴は表示しない
  const items =
    state.kind === "ready" ? state.data.items.filter((item) => item.submittedAt !== null) : [];

  return (
    <Dialog
      open={props.open}
      title={title}
      onClose={props.onClose}
      closeOnEsc={false}
      closeOnBackdrop={false}
      className="rl-popup rl-usage"
      footer={
        <button type="button" className="rl-usage-close" onClick={props.onClose}>
          {t.close}
        </button>
      }
    >
      {state.kind === "loading" ? <p className="rl-usage-status">{t.loading}</p> : null}
      {state.kind === "error" ? (
        <p className="rl-usage-status" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.kind === "ready" ? (
        <div
          ref={scrollRef}
          className="rl-usage__scroll"
          {...(scrollable ? { tabIndex: 0, role: "region", "aria-label": title } : {})}
        >
          {items.length > 0 ? (
            <table className="rl-usage-table" data-testid="usage-log-table">
              <thead>
                <tr>
                  <th scope="col">{t.submittedAt}</th>
                  <th scope="col">{t.name}</th>
                  <th scope="col">{t.phoneNumber}</th>
                  <th scope="col">{t.diagnosisExperience}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.usageLogId}>
                    <td>{item.submittedAt ? formatUsageLogDateTime(item.submittedAt) : null}</td>
                    <td>{item.name}</td>
                    <td>{item.phoneNumber}</td>
                    <td>{ADMIN_TEXTS.diagnosisExperience[item.diagnosisExperience]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

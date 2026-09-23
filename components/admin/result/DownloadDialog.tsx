"use client";
// P-02 ダウンロード設定（06 §3.5.11）。2 モードの選択と、現在の比較状態の引き継ぎ（D06-16）
import { useState } from "react";

import { useComparison } from "./ComparisonProvider";
import { Dialog } from "@/components/ui/Dialog";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { formatPopulationLabel } from "@/lib/presentation/comparison-view";
import type { ComparisonScope } from "@/lib/scoring/types";
import { AdminApiError, downloadPdf } from "@/lib/utils/admin-api";

type Mode = "full" | "restricted";

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // ダウンロードの開始後に解放する
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function DownloadButton(props: { readonly resultId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        {ADMIN_TEXTS.download}
      </button>
      {open ? <DownloadDialog resultId={props.resultId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function DownloadDialog(props: { readonly resultId: string; readonly onClose: () => void }) {
  const comparison = useComparison();
  const [mode, setMode] = useState<Mode>("full");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 比較組織は ready のときだけ引き継ぐ（empty・未選択は scope を付けない。04 D04-35）
  const scope: ComparisonScope | null = comparison.kind === "ready" ? comparison.scope : null;
  const comparisonLabel =
    comparison.kind === "ready"
      ? formatPopulationLabel(comparison.comparison.scope, comparison.comparison.populationSize)
      : comparison.kind === "empty"
        ? ADMIN_TEXTS.pdfComparisonEmpty
        : ADMIN_TEXTS.pdfComparisonNone;

  const start = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      let pdf;
      try {
        pdf = await downloadPdf(props.resultId, { mode, scope });
      } catch (e) {
        // scope 付きで要求した後に母集団が 0 件になった: scope を外して 1 回だけ再要求（06 §3.5.11、T-31）
        if (
          e instanceof AdminApiError &&
          e.status === 409 &&
          e.code === "POPULATION_EMPTY" &&
          scope
        ) {
          setNotice(ADMIN_TEXTS.pdfWithoutComparison);
          pdf = await downloadPdf(props.resultId, { mode, scope: null });
        } else {
          throw e;
        }
      }
      saveBlob(pdf.blob, pdf.filename);
      props.onClose();
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : ADMIN_TEXTS.networkError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      title={ADMIN_TEXTS.download}
      onClose={props.onClose}
      closeDisabled={busy}
      footer={
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => void start()}
          disabled={busy}
        >
          {busy ? ADMIN_TEXTS.pdfGenerating : ADMIN_TEXTS.startDownload}
        </button>
      }
    >
      <fieldset className="download-options" disabled={busy}>
        <legend className="visually-hidden">出力する内容</legend>
        {(
          [
            ["full", ADMIN_TEXTS.downloadFull],
            ["restricted", ADMIN_TEXTS.downloadRestricted],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="download-options__item">
            <input
              type="radio"
              name="pdf-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />{" "}
            {label}
          </label>
        ))}
      </fieldset>
      <p className="muted" data-testid="pdf-comparison">
        {comparisonLabel}
      </p>
      {busy ? (
        <p role="status" className="ai-analysis__progress">
          <span className="spinner" aria-hidden="true" /> {ADMIN_TEXTS.pdfGenerating}
        </p>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

"use client";
// セクション 7 AI 解説（06 §3.5.9）。生成（POST …/ai-analysis。同期方式）、生成中のポーリング（GET）、失敗時の再試行。
// ヘッダーの「AI解説を表示」ボタンとセクション内のボタンが同じ状態を共有するため Context にする
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { AiAnalysisBody } from "./AiAnalysisBody";
import { useToast } from "@/components/ui/Toast";
import { ADMIN_TEXTS, aiFailureText } from "@/lib/presentation/admin-texts";
import {
  AI_POLL_INTERVAL_MS,
  type AiAnalysisState,
  classifyAiPostFailure,
  pollingExpired,
} from "@/lib/presentation/ai-analysis-view";
import { AdminApiError, fetchAiAnalysis, requestAiAnalysis } from "@/lib/utils/admin-api";

const SECTION_ID = "ai-analysis";

type Busy = "idle" | "requesting" | "polling";

interface AiAnalysisContextValue {
  readonly state: AiAnalysisState;
  readonly busy: Busy;
  readonly hidden: boolean;
  /** 429・404 の後は再読み込みまでボタンを無効化する（06 §3.5.9） */
  readonly locked: boolean;
  readonly notice: string | null;
  readonly pollingTimedOut: boolean;
  readonly show: () => void;
  readonly hide: () => void;
}

const AiAnalysisContext = createContext<AiAnalysisContextValue | null>(null);

function useAiAnalysis(): AiAnalysisContextValue {
  const value = useContext(AiAnalysisContext);
  if (!value) throw new Error("AiAnalysisProvider の外で使われています");
  return value;
}

function scrollToSection(): void {
  document.getElementById(SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function withoutResultId(dto: AiAnalysisState & { readonly resultId?: string }): AiAnalysisState {
  return { status: dto.status, startedAt: dto.startedAt, error: dto.error, latest: dto.latest };
}

export function AiAnalysisProvider(props: {
  readonly resultId: string;
  readonly initial: AiAnalysisState;
  readonly children: ReactNode;
}) {
  const { resultId } = props;
  const toast = useToast();
  const [state, setState] = useState<AiAnalysisState>(props.initial);
  const [busy, setBusy] = useState<Busy>(
    props.initial.status === "generating" ? "polling" : "idle",
  );
  const [hidden, setHidden] = useState(false);
  const [locked, setLocked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const busyRef = useRef(busy);
  busyRef.current = busy;

  // 生成中のポーリング（3 秒間隔、最大 10 分）
  useEffect(() => {
    if (busy !== "polling") return;
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const dto = withoutResultId(await fetchAiAnalysis(resultId, controller.signal));
        if (controller.signal.aborted) return;
        setState(dto);
        if (dto.status !== "generating") {
          setBusy("idle");
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
        // 一時的な失敗はポーリングを続ける（上限で打ち切る）
      }
      if (pollingExpired(Date.now() - startedAt)) {
        setPollingTimedOut(true);
        setBusy("idle");
        return;
      }
      timer = setTimeout(() => void tick(), AI_POLL_INTERVAL_MS);
    };
    timer = setTimeout(() => void tick(), AI_POLL_INTERVAL_MS);
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [busy, resultId]);

  const checkState = useCallback(async () => {
    try {
      const dto = withoutResultId(await fetchAiAnalysis(resultId));
      setState(dto);
      setBusy(dto.status === "generating" ? "polling" : "idle");
    } catch {
      toast.show(ADMIN_TEXTS.networkError, "error");
      setBusy("idle");
    }
  }, [resultId, toast]);

  const show = useCallback(() => {
    scrollToSection();
    setHidden(false);
    if (busyRef.current !== "idle" || locked) return;
    if (state.status === "completed") return; // 保存済みを表示するだけ（再生成しない）
    setNotice(null);
    setPollingTimedOut(false);
    setBusy("requesting");
    void (async () => {
      try {
        const dto = withoutResultId(await requestAiAnalysis(resultId));
        setState(dto);
        setBusy(dto.status === "generating" ? "polling" : "idle");
        scrollToSection();
      } catch (error) {
        if (!(error instanceof AdminApiError)) {
          await checkState();
          return;
        }
        const action = classifyAiPostFailure(error);
        switch (action.kind) {
          case "poll":
            setState((s) => ({ ...s, status: "generating" }));
            setBusy("polling");
            break;
          case "limit":
            setNotice(action.message);
            setLocked(true);
            setBusy("idle");
            break;
          case "failed":
            setState((s) => ({ ...s, status: "failed", error: action.reason }));
            setBusy("idle");
            break;
          case "notFound":
            toast.show(action.message, "error");
            setLocked(true);
            setBusy("idle");
            break;
          case "check":
            await checkState();
            break;
          case "error":
            toast.show(action.message, "error");
            setBusy("idle");
            break;
        }
      }
    })();
  }, [checkState, locked, resultId, state.status, toast]);

  const hide = useCallback(() => setHidden(true), []);

  const value = useMemo<AiAnalysisContextValue>(
    () => ({ state, busy, hidden, locked, notice, pollingTimedOut, show, hide }),
    [state, busy, hidden, locked, notice, pollingTimedOut, show, hide],
  );
  return <AiAnalysisContext.Provider value={value}>{props.children}</AiAnalysisContext.Provider>;
}

function isWorking(ctx: AiAnalysisContextValue): boolean {
  return ctx.busy !== "idle";
}

/** ヘッダーの「AI解説を表示」（06 §3.5.2）。押すとセクション 7 へスクロールし、未生成なら生成を始める */
export function AiAnalysisHeaderButton() {
  const ctx = useAiAnalysis();
  return (
    <button
      type="button"
      className="btn btn--primary"
      onClick={ctx.show}
      disabled={isWorking(ctx) || ctx.locked}
    >
      {ADMIN_TEXTS.showAi}
    </button>
  );
}

export function AiAnalysisSection() {
  const ctx = useAiAnalysis();
  const { state } = ctx;
  const working = isWorking(ctx) || state.status === "generating";
  const completed = state.status === "completed" && state.latest !== null;

  return (
    <section className="result-section" aria-labelledby="section-ai" id={SECTION_ID}>
      <h2 id="section-ai">AI 解説</h2>
      <div className="panel" data-testid="ai-analysis-section" data-status={state.status}>
        <div className="ai-analysis__actions">
          {completed && !ctx.hidden ? (
            <button type="button" className="btn" onClick={ctx.hide}>
              {ADMIN_TEXTS.hideAi}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--primary"
              onClick={ctx.show}
              disabled={working || ctx.locked}
            >
              {state.status === "failed" && !working ? ADMIN_TEXTS.retryAi : ADMIN_TEXTS.showAi}
            </button>
          )}
        </div>
        <p className="muted small">{ADMIN_TEXTS.aiDisclaimer}</p>

        {working && !ctx.pollingTimedOut && (
          <p className="ai-analysis__progress" role="status">
            <span className="spinner" aria-hidden="true" /> {ADMIN_TEXTS.aiGenerating}
          </p>
        )}
        {ctx.pollingTimedOut && state.status === "generating" && (
          <p className="notice notice--error" role="alert">
            {ADMIN_TEXTS.pollingTimeout}
          </p>
        )}
        {ctx.notice && (
          <p className="notice notice--error" role="alert">
            {ctx.notice}
          </p>
        )}
        {state.status === "failed" && !working && (
          <div role="alert" className="ai-analysis__failed">
            <p className="notice notice--error">{ADMIN_TEXTS.aiFailed}</p>
            <p className="muted small">{aiFailureText(state.error)}</p>
          </div>
        )}
        {completed && !ctx.hidden && state.latest && (
          <AiAnalysisBody output={state.latest.output} generatedAt={state.latest.generatedAt} />
        )}
      </div>
    </section>
  );
}

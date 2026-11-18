"use client";
// 種類ごとの AI 解説の生成と状態（11-6 §3.9 の useAiGeneration。§2.3.4・§2.3.5、06 §3.5.9）。旧の AI 解説の領域の生成・読み直し・
// 失敗の扱いを種類ごとに一般化したもの。API を呼ぶために resultId を引数に足した（§3.9 は useAiGeneration(kind, initial)。名前と
// 引数は 11 総論 8.3 の 13 のとおり先に入るこの形に合わせ、後の仕様書を読み替える）。
// - generate(): 生成の要求（POST …/ai-analysis/{kind}。同期方式で最大 300 秒。ブラウザ側のタイムアウトは設けない）。この画面の要求・
//   読み直しの最中、404 の後（locked）、生成済みのときは何もしない（戻り値 false）。応答が届いたら、その内容で状態を置き換える
//   （generating なら読み直しに移る）。失敗は classifyAiPostFailure（§3.7.10）で分ける: 409 AI_ALREADY_GENERATING は生成中の表示で
//   読み直し、502 は失敗の枠（理由は details.reason）、404 は通知（Toast）に応答の文を出して再読み込みまでボタンを押せなくし、通信の
//   失敗と 5xx は GET で 1 回確かめ（generating なら読み直し、確かめも失敗したら通知 T-33）、そのほか（409 AI_NOT_APPLICABLE・
//   503 AI_KIND_DISABLED・422 など）は通知に応答の文を出して状態を変えない。
// - 読み直し（§2.3.5）: 3 秒（AI_POLL_INTERVAL_MS）ごとに GET …/ai-analysis/{kind} を送り（ページを離れたら AbortController で
//   止める）、generating でなくなったら止める。10 分（AI_POLL_MAX_MS）たったら止めて pollingTimedOut を立てる（状態は generating の
//   まま。パネルは T-29 を出す）。一時的な失敗は読み直しを続ける。開いたときに generating（別の画面で始まっている）なら読み直しから
//   始める。種類ごとに別々に読み直す（ほかの種類の生成中を邪魔しない）。
// - startedHere は、この画面で生成を始めたか（経年比較の読み上げの文と replace(dto) は PR-7.11a が足す）
import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";
import type { AiAnalysisKind } from "@/lib/ai/kinds";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import {
  AI_POLL_INTERVAL_MS,
  classifyAiPostFailure,
  pollingExpired,
} from "@/lib/presentation/ai-analysis-view";
import type { AiKindResponse } from "@/lib/services/dto/ai";
import { AdminApiError, fetchAiKind, requestAiKind } from "@/lib/utils/admin-api";

/** 種類の状態（GET・POST …/ai-analysis/{kind} の応答から resultId と kind を除いた形。採用向けは RecruitmentAiDto と同じ） */
export type AiKindDto<K extends AiAnalysisKind> = Omit<
  Extract<AiKindResponse, { readonly kind: K }>,
  "resultId" | "kind"
>;

/** この画面の要求の状態: なし・生成の要求の応答待ち・読み直しの最中 */
export type AiGenerationBusy = "idle" | "requesting" | "polling";

export interface AiGeneration<K extends AiAnalysisKind> {
  readonly state: AiKindDto<K>;
  readonly busy: AiGenerationBusy;
  /** 404 の後は再読み込みまでボタンを押せない（06 §3.5.9） */
  readonly locked: boolean;
  /** 読み直しが 10 分たっても generating のままだった（T-29） */
  readonly pollingTimedOut: boolean;
  /** この画面で生成を始めたか */
  readonly startedHere: boolean;
  /** 生成を始める。始めなかったとき（要求・読み直しの最中、404 の後、生成済み）は false */
  readonly generate: () => boolean;
}

export function useAiGeneration<K extends AiAnalysisKind>(
  resultId: string,
  kind: K,
  initial: AiKindDto<K>,
): AiGeneration<K> {
  const toast = useToast();
  const [state, setState] = useState<AiKindDto<K>>(initial);
  const [busy, setBusy] = useState<AiGenerationBusy>(
    initial.status === "generating" ? "polling" : "idle",
  );
  const [locked, setLocked] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [startedHere, setStartedHere] = useState(false);
  // generate の判定は最新の値で行う（押した直後の描画の前に、もう一度押されても 2 回送らない）
  const latest = useRef({ busy, locked, status: state.status });
  latest.current = { busy, locked, status: state.status };

  // 生成中の読み直し（3 秒ごと、最大 10 分）
  useEffect(() => {
    if (busy !== "polling") return;
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const dto = await fetchAiKind(resultId, kind, controller.signal);
        if (controller.signal.aborted) return;
        setState(dto);
        if (dto.status !== "generating") {
          setBusy("idle");
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
        // 一時的な失敗は読み直しを続ける（上限で打ち切る）
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
  }, [busy, kind, resultId]);

  /** 生成の要求の応答が届かなかったとき（通信の失敗・5xx）に、GET で 1 回確かめる */
  const checkState = useCallback(async () => {
    try {
      const dto = await fetchAiKind(resultId, kind);
      setState(dto);
      setBusy(dto.status === "generating" ? "polling" : "idle");
    } catch {
      toast.show(ADMIN_TEXTS.networkError, "error");
      setBusy("idle");
    }
  }, [kind, resultId, toast]);

  const generate = useCallback((): boolean => {
    const now = latest.current;
    if (now.busy !== "idle" || now.locked || now.status === "completed") return false;
    latest.current = { ...now, busy: "requesting" };
    setStartedHere(true);
    setPollingTimedOut(false);
    setBusy("requesting");
    void (async () => {
      try {
        const dto = await requestAiKind(resultId, kind);
        setState(dto);
        setBusy(dto.status === "generating" ? "polling" : "idle");
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
    return true;
  }, [checkState, kind, resultId, toast]);

  return { state, busy, locked, pollingTimedOut, startedHere, generate };
}

"use client";
// R-03 設問ページ本体（05 §5.3〜§5.4、§6.4、§7）。回答状態の保持、ページ単位の保存、ナビゲーション、未回答チェック、送信。
// 「次へ」に紐づく処理は保存と遷移だけ（採点・上書きは行わない。要件定義書 §11 の 1 番）
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { examPageNoOf } from "@/lib/masters/question-layout";
import { isChoiceCode } from "@/lib/presentation/exam-choices";
import { examErrorAction, type ExamApiOperation } from "@/lib/presentation/exam-errors";
import type { ExamPage } from "@/lib/presentation/exam-pages";
import { EXAM_TEXTS, type ExamBannerTextId } from "@/lib/presentation/exam-texts";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";
import {
  clearAllExamDrafts,
  clearExamDraft,
  readExamDraft,
  setExamFlash,
  takeExamFlash,
  writeExamDraft,
} from "@/lib/utils/exam-draft-storage";
import {
  RespondentApiError,
  saveAnswers,
  submitSession,
  toAnswerMap,
} from "@/lib/utils/respondent-api";

import { BusyOverlay } from "./BusyOverlay";
import { choiceInputId } from "./ChoiceRadioGroup";
import { ErrorBanner } from "./ErrorBanner";
import { PageNav } from "./PageNav";
import { ProgressHeader } from "./ProgressHeader";
import { QuestionCard } from "./QuestionCard";
import { SessionUnavailableView } from "./SessionUnavailableView";
import { SubmitConfirmDialog } from "./SubmitConfirmDialog";

export interface QuestionPageProps {
  readonly sessionId: string;
  readonly page: ExamPage;
  /** SessionProgressDto.answers（全ページ分） */
  readonly savedAnswers: ReadonlyArray<{
    readonly questionNo: QuestionNo;
    readonly choiceCode: ChoiceCode;
  }>;
  readonly totalCount: number;
  readonly stepCount: number;
}

interface Banner {
  readonly text: ExamBannerTextId;
  readonly actionLabel?: string;
  readonly action?: () => void;
}

type Busy = null | "save" | "submit";

/** 「戻る」の部分保存に失敗したときに遷移先へ渡す内容（05 §5.3.7） */
interface BackSaveFailure {
  readonly text: "E-02";
  readonly pageNo: number;
}

function toFailure(error: unknown): RespondentApiError {
  return error instanceof RespondentApiError
    ? error
    : new RespondentApiError(0, "NETWORK_ERROR", "network error");
}

export function QuestionPage({
  sessionId,
  page,
  savedAnswers,
  totalCount,
  stepCount,
}: QuestionPageProps) {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const saved = useMemo(() => toAnswerMap(savedAnswers), [savedAnswers]);
  const pageQuestionNos = useMemo(() => page.questions.map((q) => q.questionNo), [page]);

  const [selections, setSelections] = useState<ReadonlyMap<number, ChoiceCode>>(() => {
    const initial = new Map<number, ChoiceCode>();
    for (const q of pageQuestionNos) {
      const v = saved.get(q);
      if (isChoiceCode(v)) initial.set(q, v);
    }
    return initial;
  });
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const inFlight = useRef(false);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const pageSet = useMemo(() => new Set<number>(pageQuestionNos), [pageQuestionNos]);
  const unanswered = pageQuestionNos.filter((q) => !selections.has(q));
  const savedOutsidePage = [...saved.keys()].filter((q) => !pageSet.has(q)).length;
  const answered = savedOutsidePage + selections.size;
  const dirty = pageQuestionNos.some((q) => selections.get(q) !== saved.get(q));

  // sessionStorage の退避値はサーバの保存済み回答より新しいため優先する（05 §6.4）。
  // 描画の不一致を避けるため、表示後に読み込む
  useEffect(() => {
    const draft = readExamDraft(sessionId, page.pageNo);
    if (draft.size > 0) {
      setSelections((prev) => {
        const next = new Map(prev);
        for (const [q, v] of draft) if (pageSet.has(q) && isChoiceCode(v)) next.set(q, v);
        return next;
      });
    }
    const flash = takeExamFlash(sessionId);
    if (flash) {
      try {
        const failure = JSON.parse(flash) as BackSaveFailure;
        if (failure.text === "E-02" && Number.isInteger(failure.pageNo)) {
          setBanner({
            text: "E-02",
            actionLabel: EXAM_TEXTS["B-08"],
            action: () => void retryBackSave(failure.pageNo),
          });
        }
      } catch {
        // 壊れた値は捨てる
      }
    }
    // 表示時に 1 回だけ実行する（ページごとに key を変えて描画し直すため、依存を持たない）
  }, []);

  // 未保存の選択があるときだけ、タブを閉じる・URL を直接変える操作に確認を出す（05 §7.3 D05-25）
  useEffect(() => {
    if (!dirty || busy !== null) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, busy]);

  function navigate(to: string, mode: "push" | "replace" = "push") {
    startTransition(() => {
      if (mode === "push") router.push(to);
      else router.replace(to);
    });
  }

  function select(questionNo: number, code: ChoiceCode) {
    setSelections((prev) => {
      const next = new Map(prev);
      next.set(questionNo, code);
      writeExamDraft(sessionId, page.pageNo, next);
      return next;
    });
  }

  function answersPayload(onlySelected: ReadonlyMap<number, ChoiceCode>) {
    // このページの設問だけを送る（サーバも所属を検証する。04 §4.4）
    return pageQuestionNos.flatMap((q) => {
      const v = onlySelected.get(q);
      return v === undefined ? [] : [{ questionNo: q, choiceCode: v }];
    });
  }

  /** 失敗の扱いを適用する。true を返したら画面を離れる（全面表示・完了画面） */
  function applyFailure(operation: ExamApiOperation, error: unknown, retry: () => void): boolean {
    const action = examErrorAction(operation, toFailure(error));
    switch (action.kind) {
      case "session_unavailable":
        setUnavailable(true);
        return true;
      case "complete":
        clearAllExamDrafts(sessionId);
        navigate(`/exam/${sessionId}/complete`, "replace");
        return true;
      case "unanswered": {
        const target = examPageNoOf(action.questionNo);
        setBanner({
          text: "E-03",
          actionLabel: EXAM_TEXTS["B-10"],
          action: () => navigate(`/exam/${sessionId}/questions/${target}`),
        });
        return false;
      }
      case "banner":
        setBanner(
          action.retry
            ? { text: action.text, actionLabel: EXAM_TEXTS["B-08"], action: retry }
            : { text: action.text },
        );
        return false;
      case "registration_issues":
        setBanner({ text: "E-01", actionLabel: EXAM_TEXTS["B-08"], action: retry });
        return false;
    }
  }

  async function savePage(retry: () => void): Promise<boolean> {
    try {
      await saveAnswers(sessionId, { pageNo: page.pageNo, answers: answersPayload(selections) });
      clearExamDraft(sessionId, page.pageNo);
      return true;
    } catch (error) {
      applyFailure("save", error, retry);
      return false;
    }
  }

  function focusFirstUnanswered(questionNo: number) {
    requestAnimationFrame(() => {
      document.getElementById(`question-${questionNo}`)?.scrollIntoView({ block: "start" });
      document.getElementById(choiceInputId(questionNo, 1))?.focus({ preventScroll: true });
    });
  }

  async function onNext() {
    if (inFlight.current) return;
    const first = unanswered[0];
    if (first !== undefined) {
      // 遷移しない。未回答カードを赤枠にし、最初の未回答へ（05 §5.3.6）
      setShowErrors(true);
      focusFirstUnanswered(first);
      return;
    }
    if (page.isLast) {
      setBanner(null);
      setDialogOpen(true);
      return;
    }
    inFlight.current = true;
    setBusy("save");
    setBanner(null);
    const ok = await savePage(() => void onNext());
    inFlight.current = false;
    setBusy(null);
    if (ok) navigate(`/exam/${sessionId}/questions/${page.pageNo + 1}`);
  }

  async function onBack() {
    if (inFlight.current || page.isFirst) return;
    const previous = `/exam/${sessionId}/questions/${page.pageNo - 1}`;
    const payload = answersPayload(selections);
    if (payload.length === 0) {
      navigate(previous);
      return;
    }
    inFlight.current = true;
    setBusy("save");
    try {
      // 選択済みの分だけの部分保存（04 D04-19）
      await saveAnswers(sessionId, { pageNo: page.pageNo, answers: payload });
      clearExamDraft(sessionId, page.pageNo);
    } catch (error) {
      const action = examErrorAction("save", toFailure(error));
      if (action.kind === "session_unavailable" || action.kind === "complete") {
        applyFailure("save", error, () => void onBack());
        inFlight.current = false;
        setBusy(null);
        return;
      }
      // 保存に失敗しても遷移する。未保存分は sessionStorage に残り、戻ってきたときに復元される（05 §5.3.7）
      const failure: BackSaveFailure = { text: "E-02", pageNo: page.pageNo };
      setExamFlash(sessionId, JSON.stringify(failure));
    }
    inFlight.current = false;
    setBusy(null);
    navigate(previous);
  }

  /** 「戻る」で保存できなかったページの退避値を、遷移先から保存し直す */
  async function retryBackSave(pageNo: number) {
    if (inFlight.current) return;
    const draft = readExamDraft(sessionId, pageNo);
    const answers = [...draft]
      .filter(([, v]) => isChoiceCode(v))
      .map(([questionNo, choiceCode]) => ({ questionNo, choiceCode: choiceCode as ChoiceCode }));
    if (answers.length === 0) {
      setBanner(null);
      return;
    }
    inFlight.current = true;
    setBusy("save");
    try {
      await saveAnswers(sessionId, { pageNo, answers });
      clearExamDraft(sessionId, pageNo);
      setBanner(null);
    } catch (error) {
      applyFailure("save", error, () => void retryBackSave(pageNo));
    }
    inFlight.current = false;
    setBusy(null);
  }

  async function submitOnly() {
    try {
      const submitted = await submitSession(sessionId);
      clearAllExamDrafts(sessionId);
      navigate(submitted.nextUrl, "replace");
      return; // 遷移完了まで BusyOverlay を残す
    } catch (error) {
      setDialogOpen(false);
      if (applyFailure("submit", error, () => void resubmit())) return;
    }
    inFlight.current = false;
    setBusy(null);
  }

  /** E-01 の「再試行」: 保存は完了しているため送信から（05 §5.4.2） */
  async function resubmit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("submit");
    setBanner(null);
    await submitOnly();
  }

  async function onConfirmSubmit() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy("submit");
    setBanner(null);
    // 最終ページの回答を保存してから送信する（送信 API は回答を受け取らない。04 D04-20）
    const ok = await savePage(() => {
      setDialogOpen(true);
    });
    if (!ok) {
      setDialogOpen(false);
      inFlight.current = false;
      setBusy(null);
      return;
    }
    await submitOnly();
  }

  function onCancelSubmit() {
    setDialogOpen(false);
    nextButtonRef.current?.focus();
  }

  if (unavailable) return <SessionUnavailableView />;

  const overlayText = busy === "submit" ? EXAM_TEXTS["L-03"] : EXAM_TEXTS["L-02"];

  return (
    <div data-testid="question-page" data-page-no={page.pageNo}>
      <ProgressHeader
        step={page.step}
        pageInStep={page.pageInStep}
        answered={answered}
        total={totalCount}
        stepCount={stepCount}
      />
      {banner ? (
        <ErrorBanner text={banner.text} actionLabel={banner.actionLabel} onAction={banner.action} />
      ) : null}
      <div className="exam-questions">
        {page.questions.map((q) => (
          <QuestionCard
            key={q.questionNo}
            questionNo={q.questionNo}
            text={q.text}
            value={selections.get(q.questionNo) ?? null}
            showUnansweredError={showErrors && !selections.has(q.questionNo)}
            onChange={(code) => select(q.questionNo, code)}
          />
        ))}
      </div>
      <PageNav
        isFirst={page.isFirst}
        isLast={page.isLast}
        unansweredCount={unanswered.length}
        busy={busy !== null || isNavigating}
        onBack={() => void onBack()}
        onNext={() => void onNext()}
        nextButtonRef={nextButtonRef}
      />
      <SubmitConfirmDialog
        open={dialogOpen}
        busy={busy === "submit"}
        onConfirm={() => void onConfirmSubmit()}
        onCancel={onCancelSubmit}
      />
      {busy !== null || isNavigating ? <BusyOverlay text={overlayText} /> : null}
    </div>
  );
}

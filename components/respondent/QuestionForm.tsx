"use client";
// R-03 受験画面（11-1 §2.4）。今のステップの設問を 1 枚のカードに出し、Step 1〜3 は「次へ」、Step 4 は「送信する」。URL は変えない。
// 回答は選んだ時点で保存する（answer-queue。同時に 1 本、送信中に選んだ分は応答のあとに続けて送る。間引きなし）。
// 未送信の選択は sessionStorage に退避し、開いたときに保存し直す（11-1 §2.4.5）。保存中・保存の失敗は画面に出さない。
// 「次へ」に結び付ける処理は保存と次のステップの表示だけ（採点・上書きをしない。決定事項 2）。
// 設問マスタ（JSON）を読み込まないよう、exam-steps.ts は型だけを使い、設問番号 → ステップは stepOf で求める
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { QUESTION_STEP_SIZES, stepOf } from "@/lib/masters/question-layout";
import {
  addSelection,
  addSelections,
  completeBatch,
  EMPTY_ANSWER_QUEUE,
  failBatch,
  isSettled,
  pendingOfStep,
  pendingStepNos,
  takeBatch,
  type AnswerQueue,
} from "@/lib/presentation/answer-queue";
import { isChoiceCode } from "@/lib/presentation/exam-choices";
import { examErrorAction } from "@/lib/presentation/exam-errors";
import type { ExamStep, ExamStepNo } from "@/lib/presentation/exam-steps";
import { EXAM_TEXTS, examTextStep, type ExamBannerTextId } from "@/lib/presentation/exam-texts";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";
import { clearAllExamDrafts, loadExamDrafts, writeExamDraft } from "@/lib/utils/exam-draft-storage";
import { RespondentApiError, saveAnswers, submitSession } from "@/lib/utils/respondent-api";

import { choiceInputId } from "./ChoiceRadioGroup";
import { ExamAlertDialog } from "./ExamAlertDialog";
import { LoadingOverlay } from "./LoadingOverlay";
import { PageHeading } from "./PageHeading";
import { QuestionCard } from "./QuestionCard";
import { SessionUnavailableView } from "./SessionUnavailableView";
import { StepIndicator } from "./StepIndicator";

export interface QuestionFormProps {
  readonly sessionId: string;
  readonly steps: readonly ExamStep[]; // 4 件
  readonly initialStepNo: ExamStepNo; // 未回答の設問がある最初のステップ（11-1 §2.4.8、K-41）
  /** SessionProgressDto.answers（全ステップ分） */
  readonly savedAnswers: ReadonlyArray<{
    readonly questionNo: QuestionNo;
    readonly choiceCode: ChoiceCode;
  }>;
}

/** 送信のあと、ロード中を出したまま完了画面へ移るまでの待ち（参照元の送信のワークフローの手順 66。11-1 §2.4.7） */
const SUBMITTED_WAIT_MS = 2000;
const STEP_COUNT = QUESTION_STEP_SIZES.length;

function toFailure(error: unknown): RespondentApiError {
  return error instanceof RespondentApiError
    ? error
    : new RespondentApiError(0, "NETWORK_ERROR", "network error");
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function QuestionForm({ sessionId, steps, initialStepNo, savedAnswers }: QuestionFormProps) {
  const router = useRouter();
  const [stepNo, setStepNo] = useState<ExamStepNo>(initialStepNo);
  const [answers, setAnswers] = useState<ReadonlyMap<QuestionNo, ChoiceCode>>(
    () => new Map(savedAnswers.map((a) => [a.questionNo, a.choiceCode])),
  );
  /** 「次へ」「送信する」を押して未回答があったか（今のステップの未回答に印を付ける） */
  const [marked, setMarked] = useState(false);
  const [focusTarget, setFocusTarget] = useState<QuestionNo | null>(null);
  const [alert, setAlert] = useState<ExamBannerTextId | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const queue = useRef<AnswerQueue>(EMPTY_ANSWER_QUEUE);
  const draining = useRef<Promise<RespondentApiError | null> | null>(null);
  /** 「次へ」「送信する」の処理中（送信中の印。以後の押下は無視する） */
  const busy = useRef(false);
  /** 「次へ」で次のステップを出した（行が画面の上に来るようにスクロールする） */
  const advanced = useRef(false);
  const stepRow = useRef<HTMLDivElement>(null);

  const completePath = `/exam/${sessionId}/complete`;
  const step = steps.find((s) => s.stepNo === stepNo);

  /**
   * 未送信の選択をステップごとに送り切る（同時に 1 本。送信中に選んだ分も続けて送る）。
   * 送り切れば null、失敗したらそのエラー（未送信は残る）。送っている途中なら、その送り切りを待つ
   */
  function drain(): Promise<RespondentApiError | null> {
    if (draining.current) return draining.current;
    if (isSettled(queue.current)) return Promise.resolve(null);
    const run = (async (): Promise<RespondentApiError | null> => {
      for (;;) {
        const next = pendingStepNos(queue.current)[0];
        if (next === undefined) return null;
        const taken = takeBatch(queue.current, next);
        if (!taken) return null;
        queue.current = taken.queue;
        try {
          await saveAnswers(sessionId, taken.batch);
          queue.current = completeBatch(queue.current);
          // 送れた分を退避から外す（ステップの未送信が無くなればキーを消す）
          writeExamDraft(sessionId, next, pendingOfStep(queue.current, next));
        } catch (error) {
          queue.current = failBatch(queue.current);
          return toFailure(error);
        }
      }
    })();
    draining.current = run;
    void run.finally(() => {
      if (draining.current === run) draining.current = null;
    });
    return run;
  }

  function goComplete() {
    clearAllExamDrafts(sessionId);
    router.replace(completePath);
  }

  /** 選んだ時点の自動保存の失敗（11-1 §2.4.5）。401・404 は R-06、409 は完了画面へ、そのほかは未送信のまま（通知しない） */
  function onAutoSaveFailure(failure: RespondentApiError) {
    const action = examErrorAction("save", failure);
    if (action.kind === "session_unavailable") {
      setLoading(false);
      setUnavailable(true);
    } else if (action.kind === "complete") {
      goComplete();
    }
  }

  /** 「次へ」「送信する」の前の保存の失敗（11-1 §2.4.6・§2.4.7 手順 3） */
  function onFlushFailure(failure: RespondentApiError) {
    const action = examErrorAction("flush", failure);
    setLoading(false);
    if (action.kind === "session_unavailable") setUnavailable(true);
    else if (action.kind === "complete") goComplete();
    else setAlert(action.kind === "alert" ? action.textId : "E-02");
  }

  // 開いたとき: 退避（全ステップ分と M7 より前のキーの分）をサーバの回答の上に重ねて未送信にし、すぐに保存する
  useEffect(() => {
    const selections = new Map<QuestionNo, ChoiceCode>();
    for (const [questionNo, value] of loadExamDrafts(sessionId)) {
      if (isChoiceCode(value)) selections.set(questionNo, value);
    }
    if (selections.size === 0) return;
    queue.current = addSelections(queue.current, selections);
    setAnswers((prev) => new Map([...prev, ...selections]));
    void drain().then((failure) => {
      if (failure) onAutoSaveFailure(failure);
    });
    // 表示のときに 1 回だけ行う
  }, []);

  // 未送信の選択があるか保存の通信中のときだけ、タブを閉じる操作にブラウザの確認を出す（11-1 §2.4.9）
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isSettled(queue.current)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // 未回答の印を付けた設問の先頭までスクロールし、その最初の選択肢にフォーカスを移す（11-1 §2.4.6）
  useEffect(() => {
    if (focusTarget === null) return;
    document.getElementById(`question-${focusTarget}`)?.scrollIntoView({ block: "start" });
    document.getElementById(choiceInputId(focusTarget, 1))?.focus({ preventScroll: true });
    setFocusTarget(null);
  }, [focusTarget]);

  // 次のステップを出したら、ステップ表示の行が画面の上に来るようにスクロールする（見出しへのフォーカスは PageHeading）
  useEffect(() => {
    if (!advanced.current) return;
    advanced.current = false;
    stepRow.current?.scrollIntoView({ block: "start" });
  }, [stepNo]);

  function select(questionNo: QuestionNo, code: ChoiceCode) {
    queue.current = addSelection(queue.current, questionNo, code);
    const questionStep = stepOf(questionNo);
    writeExamDraft(sessionId, questionStep, pendingOfStep(queue.current, questionStep));
    setAnswers((prev) => new Map(prev).set(questionNo, code));
    void drain().then((failure) => {
      if (failure) onAutoSaveFailure(failure);
    });
  }

  /** 今のステップに未回答があれば、すべてに印を付けて最初の未回答へ。あれば true（進まない） */
  function markUnanswered(current: ExamStep): boolean {
    const first = current.questions.find((q) => !answers.has(q.questionNo));
    if (!first) return false;
    setMarked(true);
    setFocusTarget(first.questionNo);
    return true;
  }

  // 「次へ」（Step 1〜3。11-1 §2.4.6）
  async function onNext() {
    if (busy.current || !step || step.isLast) return;
    if (markUnanswered(step)) return;
    busy.current = true;
    // 未送信の選択を保存し終えるのを待つ（終わっていなければその間ロード中）
    if (!isSettled(queue.current)) setLoading(true);
    const failure = await drain();
    busy.current = false;
    if (failure) {
      onFlushFailure(failure);
      return;
    }
    setLoading(false);
    setMarked(false);
    advanced.current = true;
    setStepNo((step.stepNo + 1) as ExamStepNo);
  }

  /** 送信の成功（409 の二重送信の後の方を含む）: 退避を消し、ロード中のまま 2,000 ミリ秒待って完了画面へ */
  async function finishSubmit(nextUrl: string) {
    clearAllExamDrafts(sessionId);
    await wait(SUBMITTED_WAIT_MS);
    router.replace(nextUrl);
  }

  // 「送信する」（Step 4。11-1 §2.4.7）。確認なし
  async function onSubmit() {
    if (busy.current || !step) return;
    // 1. 今のステップの未回答
    if (markUnanswered(step)) return;
    // 2. 送信中の印を立て、ロード中を出す
    busy.current = true;
    setLoading(true);
    // 3. 未送信の選択を保存し終えるまで待つ
    const failure = await drain();
    if (failure) {
      busy.current = false;
      onFlushFailure(failure);
      return;
    }
    // 4. 送信（サーバが採点し、結果・利用履歴などを 1 つのトランザクションで保存する）
    try {
      const submitted = await submitSession(sessionId);
      await finishSubmit(submitted.nextUrl);
    } catch (error) {
      const action = examErrorAction("submit", toFailure(error));
      if (action.kind === "complete") {
        await finishSubmit(completePath);
        return;
      }
      busy.current = false;
      setLoading(false);
      switch (action.kind) {
        case "unanswered": {
          // 保存がどこかで失われた場合の例外: その設問のステップを出し、未回答に印を付ける（前のステップでも出す）。
          // サーバに無い回答は、画面でも未回答に戻す
          const questionNo = action.questionNo;
          setAnswers((prev) => {
            if (!prev.has(questionNo)) return prev;
            const next = new Map(prev);
            next.delete(questionNo);
            return next;
          });
          setStepNo(stepOf(questionNo));
          setMarked(true);
          setFocusTarget(questionNo);
          return;
        }
        case "session_unavailable":
          setUnavailable(true);
          return;
        case "alert":
          setAlert(action.textId);
          return;
        default:
          setAlert("E-01");
      }
    }
  }

  if (unavailable) return <SessionUnavailableView />;
  if (!step) return null;

  return (
    <div className="exam-frame-wide" data-testid="question-form" data-step-no={step.stepNo}>
      <div className="exam-form" aria-busy={loading ? true : undefined}>
        <StepIndicator ref={stepRow} current={step.stepNo} stepCount={STEP_COUNT} />
        <div className="exam-step-content">
          <section
            className={`exam-card exam-step${step.stepNo === 1 ? " exam-step--first" : ""}`}
            data-testid="step-card"
          >
            <div className="exam-step__head">
              <PageHeading key={step.stepNo} className="exam-step__heading">
                {examTextStep(step.stepNo)}
              </PageHeading>
              <p className="exam-step__guide">{EXAM_TEXTS[step.guideTextId]}</p>
            </div>
            {step.questions.map((q) => (
              <QuestionCard
                key={q.questionNo}
                questionNo={q.questionNo}
                text={q.text}
                value={answers.get(q.questionNo) ?? null}
                showUnanswered={marked && !answers.has(q.questionNo)}
                onChange={(code) => select(q.questionNo, code)}
              />
            ))}
            {step.isLast ? (
              <button
                type="button"
                className="exam-button exam-step__submit"
                onClick={() => void onSubmit()}
                data-testid="submit-button"
              >
                {EXAM_TEXTS["B-05"]}
              </button>
            ) : null}
          </section>
          {step.isLast ? null : (
            <div className="exam-step-actions">
              <button
                type="button"
                className="exam-button"
                onClick={() => void onNext()}
                data-testid="next-button"
              >
                {EXAM_TEXTS["B-03"]}
              </button>
            </div>
          )}
        </div>
      </div>
      {loading ? <LoadingOverlay /> : null}
      <ExamAlertDialog textId={alert} onClose={() => setAlert(null)} />
    </div>
  );
}

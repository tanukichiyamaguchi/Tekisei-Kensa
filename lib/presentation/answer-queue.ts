// 選んだ時点の自動保存の順番（11-1 §2.4.5・§2.4.6・§2.4.7 手順 3）。不変のデータと純関数で、受験画面（Client）が使う。
// 設問マスタ（JSON）を読まないよう、設問番号 → ステップは lib/masters/question-layout.ts の stepOf で求める。
//   - 未送信の選択（設問番号 → 選択）と、送信中の 1 本を持つ。選択を足すと未送信になる
//   - 送るときは指定したステップの未送信だけを 1 本（1〜41 問）にまとめる。送信中は次の 1 本を作らない（同時に 1 本だけ）
//   - 送信中に選んだ分は未送信に残り、応答のあとの次の 1 本にまとまる。待ち時間（間引き）は入れない
//   - 成功したら、送った値と今の値が同じ設問だけを未送信から外す（送信中に選び直した設問は残る）
//   - 失敗したら送った分を未送信のまま残す（次の選択と「次へ」「送信する」のときに送り直す）
import type { ExamStepNo } from "./exam-steps";
import { SCORED_QUESTION_COUNT, stepOf } from "@/lib/masters/question-layout";
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

/** 1 回の PUT …/answers の本文（11-1 §3.4.2 の SaveAnswersInput と同じ形） */
export interface AnswerBatch {
  readonly stepNo: ExamStepNo;
  readonly answers: ReadonlyArray<{
    readonly questionNo: QuestionNo;
    readonly choiceCode: ChoiceCode;
  }>;
}

export interface AnswerQueue {
  /** 未送信の選択。送信中の 1 本の値も、成功するまではここに残る */
  readonly pending: ReadonlyMap<QuestionNo, ChoiceCode>;
  /** 送信中の 1 本。無ければ null */
  readonly inFlight: AnswerBatch | null;
}

export const EMPTY_ANSWER_QUEUE: AnswerQueue = Object.freeze({
  pending: new Map<QuestionNo, ChoiceCode>(),
  inFlight: null,
});

const isScoredQuestionNo = (questionNo: number): boolean =>
  Number.isInteger(questionNo) && questionNo >= 1 && questionNo <= SCORED_QUESTION_COUNT;

/** 出題対象の設問のステップ。対象外は null */
const stepOfOrNull = (questionNo: number): ExamStepNo | null =>
  isScoredQuestionNo(questionNo) ? stepOf(questionNo) : null;

/** 選択を足す（未送信にする）。出題対象外の設問は無視する */
export function addSelection(
  queue: AnswerQueue,
  questionNo: QuestionNo,
  choiceCode: ChoiceCode,
): AnswerQueue {
  if (!isScoredQuestionNo(questionNo)) return queue;
  const pending = new Map(queue.pending);
  pending.set(questionNo, choiceCode);
  return { ...queue, pending };
}

/** 選択をまとめて未送信にする（開いたときの退避の取り込み。サーバの回答の上に重ねる。11-1 §2.4.5） */
export function addSelections(
  queue: AnswerQueue,
  selections: ReadonlyMap<QuestionNo, ChoiceCode>,
): AnswerQueue {
  let next = queue;
  for (const [questionNo, choiceCode] of selections) {
    next = addSelection(next, questionNo, choiceCode);
  }
  return next;
}

/** ステップの未送信の選択（設問番号の昇順。退避 tk_exam_step:{sessionId}:{stepNo} に書く値） */
export function pendingOfStep(
  queue: AnswerQueue,
  stepNo: ExamStepNo,
): ReadonlyMap<QuestionNo, ChoiceCode> {
  return new Map(
    [...queue.pending]
      .filter(([questionNo]) => stepOfOrNull(questionNo) === stepNo)
      .sort(([a], [b]) => a - b),
  );
}

/** 未送信の選択があるステップ（昇順。開いたときの取り込みはステップごとに分けて送る） */
export function pendingStepNos(queue: AnswerQueue): readonly ExamStepNo[] {
  const steps = new Set<ExamStepNo>();
  for (const questionNo of queue.pending.keys()) {
    const stepNo = stepOfOrNull(questionNo);
    if (stepNo !== null) steps.add(stepNo);
  }
  return [...steps].sort((a, b) => a - b);
}

/**
 * 指定したステップの未送信を 1 本にまとめて送信中にする。送信中の 1 本がある、またはそのステップに未送信が無いときは null
 * （呼び出し側は batch を PUT し、応答で completeBatch か failBatch を呼ぶ）
 */
export function takeBatch(
  queue: AnswerQueue,
  stepNo: ExamStepNo,
): { readonly queue: AnswerQueue; readonly batch: AnswerBatch } | null {
  if (queue.inFlight !== null) return null;
  const answers = [...pendingOfStep(queue, stepNo)].map(([questionNo, choiceCode]) => ({
    questionNo,
    choiceCode,
  }));
  if (answers.length === 0) return null;
  const batch: AnswerBatch = { stepNo, answers };
  return { queue: { ...queue, inFlight: batch }, batch };
}

/** 送信中の 1 本の成功。送った値と今の値が同じ設問だけを未送信から外す */
export function completeBatch(queue: AnswerQueue): AnswerQueue {
  const sent = queue.inFlight;
  if (sent === null) return queue;
  const pending = new Map(queue.pending);
  for (const { questionNo, choiceCode } of sent.answers) {
    if (pending.get(questionNo) === choiceCode) pending.delete(questionNo);
  }
  return { pending, inFlight: null };
}

/** 送信中の 1 本の失敗。送った分は未送信のまま残す */
export function failBatch(queue: AnswerQueue): AnswerQueue {
  return queue.inFlight === null ? queue : { ...queue, inFlight: null };
}

/** 未送信も送信中も無い（「次へ」「送信する」の待ちの終わり、beforeunload の要否、退避の削除に使う） */
export function isSettled(queue: AnswerQueue): boolean {
  return queue.pending.size === 0 && queue.inFlight === null;
}

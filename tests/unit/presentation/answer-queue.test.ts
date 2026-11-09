// M7-exam-12 自動保存の順番（11-1 §2.4.5・§2.4.6・§2.4.7 手順 3）
import { describe, expect, it } from "vitest";

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
import type { ChoiceCode, QuestionNo } from "@/lib/scoring/types";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function select(queue: AnswerQueue, ...pairs: Array<[QuestionNo, ChoiceCode]>): AnswerQueue {
  return pairs.reduce((q, [questionNo, code]) => addSelection(q, questionNo, code), queue);
}

describe("M7-exam-12 自動保存の順番", () => {
  it("選択を足すと未送信になる（元のキューは変えない）", () => {
    const queue = select(EMPTY_ANSWER_QUEUE, [5, 3]);
    expect([...queue.pending]).toEqual([[5, 3]]);
    expect(EMPTY_ANSWER_QUEUE.pending.size).toBe(0);
    expect(isSettled(EMPTY_ANSWER_QUEUE)).toBe(true);
    expect(isSettled(queue)).toBe(false);
    // 同じ設問を選び直すと値が変わるだけ
    expect([...select(queue, [5, 1]).pending]).toEqual([[5, 1]]);
  });

  it("1 回に送るのは指定したステップの設問だけ（設問番号の昇順）", () => {
    const queue = select(EMPTY_ANSWER_QUEUE, [43, 2], [5, 3], [1, 1], [124, 5]);
    const taken = takeBatch(queue, 1);
    expect(taken?.batch).toEqual({
      stepNo: 1,
      answers: [
        { questionNo: 1, choiceCode: 1 },
        { questionNo: 5, choiceCode: 3 },
      ],
    });
    expect(takeBatch(queue, 3)).toBeNull();
    expect(takeBatch(EMPTY_ANSWER_QUEUE, 1)).toBeNull();
  });

  it("1 ステップの全問（41 問）を 1 本にまとめる", () => {
    const queue = addSelections(EMPTY_ANSWER_QUEUE, new Map(range(1, 41).map((q) => [q, 4])));
    expect(takeBatch(queue, 1)?.batch.answers).toHaveLength(41);
  });

  it("送信中は次の 1 本を作らず、送信中に選んだ分は次の送信にまとまる", () => {
    const first = takeBatch(select(EMPTY_ANSWER_QUEUE, [1, 1], [2, 2]), 1);
    expect(first).not.toBeNull();
    let queue = select(first!.queue, [3, 3]);
    expect(takeBatch(queue, 1)).toBeNull(); // 同時に 1 本だけ
    expect(isSettled(queue)).toBe(false);
    queue = completeBatch(queue);
    expect([...queue.pending]).toEqual([[3, 3]]);
    expect(queue.inFlight).toBeNull();
    expect(takeBatch(queue, 1)?.batch.answers).toEqual([{ questionNo: 3, choiceCode: 3 }]);
  });

  it("成功したら、送った値と今の値が同じ設問だけが外れる（送信中に選び直した設問は残る）", () => {
    const taken = takeBatch(select(EMPTY_ANSWER_QUEUE, [1, 1], [2, 2]), 1)!;
    const reselected = select(taken.queue, [2, 5]);
    const done = completeBatch(reselected);
    expect([...done.pending]).toEqual([[2, 5]]);
    expect(takeBatch(done, 1)?.batch.answers).toEqual([{ questionNo: 2, choiceCode: 5 }]);
    // 選び直して元の値に戻したときは、送った値と同じなので外れる
    const back = completeBatch(select(taken.queue, [2, 5], [2, 2]));
    expect(back.pending.size).toBe(0);
    expect(isSettled(back)).toBe(true);
  });

  it("失敗しても未送信が残り、次の 1 本で送り直せる", () => {
    const taken = takeBatch(select(EMPTY_ANSWER_QUEUE, [10, 4]), 1)!;
    const failed = failBatch(taken.queue);
    expect([...failed.pending]).toEqual([[10, 4]]);
    expect(failed.inFlight).toBeNull();
    expect(takeBatch(failed, 1)?.batch).toEqual(taken.batch);
    // 送信中の 1 本が無いときの成功・失敗は何もしない
    expect(completeBatch(failed)).toBe(failed);
    expect(failBatch(failed)).toBe(failed);
  });

  it("開いたときの取り込み: 退避を未送信にして、ステップごとに分けて送る", () => {
    const drafts = new Map<QuestionNo, ChoiceCode>([
      [90, 1],
      [2, 3],
      [42, 5],
      [1, 2],
    ]);
    let queue = addSelections(EMPTY_ANSWER_QUEUE, drafts);
    expect(pendingStepNos(queue)).toEqual([1, 2, 3]);
    expect([...pendingOfStep(queue, 1)]).toEqual([
      [1, 2],
      [2, 3],
    ]);
    const sentSteps: number[] = [];
    for (const stepNo of pendingStepNos(queue)) {
      const taken = takeBatch(queue, stepNo)!;
      sentSteps.push(taken.batch.stepNo);
      expect(taken.batch.answers.every((a) => a.questionNo >= 1 && a.questionNo <= 144)).toBe(true);
      queue = completeBatch(taken.queue);
    }
    expect(sentSteps).toEqual([1, 2, 3]);
    expect(isSettled(queue)).toBe(true);
  });

  it("出題対象外の設問（145 など）は未送信にしない", () => {
    const queue = addSelections(
      EMPTY_ANSWER_QUEUE,
      new Map<QuestionNo, ChoiceCode>([
        [145, 1],
        [0, 1],
        [3, 2],
      ]),
    );
    expect([...queue.pending]).toEqual([[3, 2]]);
  });
});

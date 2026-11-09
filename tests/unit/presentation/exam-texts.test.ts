// M7-exam-04 文言（11-1 §2.8 が正。ID は 05 §9 を引き継ぐ）
import { describe, expect, it } from "vitest";

import { CHOICE_OPTIONS } from "@/lib/presentation/exam-choices";
import { EXAM_STEPS, questionLabel } from "@/lib/presentation/exam-steps";
import {
  EXAM_TEXTS,
  examTextQuestion,
  examTextStep,
  examTextStepIndicatorLabel,
  examTextStepLabel,
} from "@/lib/presentation/exam-texts";

/** 11-1 §2.8 の表（関数で作る Q-01・Q-L・Q-04・Q-N と、選択肢 CH-1〜CH-5 を除く） */
const SPEC_TEXTS: Readonly<Record<string, string>> = {
  "R1-01": "受験者登録",
  "R1-01X": "受験者登録(幹部用)",
  "R1-P1": "お名前を入力",
  "R1-P2": "電話番号を入力",
  "R1-P3": "職業を選択",
  "R1-P4": "選択してください。",
  "R1-03": "お名前",
  "R1-04": "電話番号",
  "R1-06": "職業",
  "R1-08": "過去の診断経験",
  "R1-09": "初めて診断する",
  "R1-10": "過去に診断したことがある",
  "B-01": "診断に進む",
  "R1-12": "すでに受験された方・ログインはこちら",
  "R7-01": "エラー",
  "R7-02": "リンクが正しくありません。\n再度ご確認の上、リンクにアクセスしてください。",
  "V-00": "未入力の項目があります",
  "V-01": "お名前を入力してください",
  "V-02": "お名前は 100 文字以内で入力してください",
  "V-03": "電話番号を入力してください",
  "V-04": "電話番号は 30 文字以内で入力してください",
  "V-05": "職業を選択してください",
  "V-06": "過去の診断経験を選択してください",
  "R2-01": "診断を開始する",
  "R2-02": "下記のボタンをクリックして、診断を開始してください。",
  "B-02": "開始する",
  "Q-G1": "直感的にサクサクと回答してください！",
  "Q-G2": "出来るだけ「どちらでもない」は選ばないで",
  "Q-G3": "今半分です！後少し頑張りましょう",
  "Q-G4": "あまり考えすぎず直感的に答えましょう",
  "Q-02": "回答してください",
  "B-03": "次へ",
  "B-05": "送信する",
  "LD-01": "ロード中",
  "C-01": "回答完了",
  "C-02": "お疲れ様でした\n回答の送信が完了しました。",
  "X-04": "回答を続けられません",
  "X-05":
    "回答の有効期限が切れたか、別の端末・ブラウザで開いています。お手数ですが、受験リンクからもう一度登録してください。",
  "E-04": "回答の有効期限が切れました。受験リンクからもう一度登録してください。",
  "X-08": "エラーが発生しました",
  "X-09": "時間をおいて、もう一度お試しください。",
  "E-01": "通信に失敗しました。電波の良い場所で、もう一度お試しください。",
  "E-02": "回答を保存できませんでした。もう一度お試しください。",
  "E-06": "アクセスが集中しています。しばらく待ってから、もう一度お試しください。",
  "E-07": "インターネットに接続されていません。接続を確認してから、もう一度お試しください。",
};

/** 11-1 §2.8 の「やめる文言」 */
const REMOVED_IDS = [
  "H-01",
  "B-04",
  "B-06",
  "B-07",
  "S-01",
  "S-02",
  "B-08",
  "B-09",
  "R3-01",
  "R3-02",
  "R3-03",
  "B-10",
  "E-03",
  "L-01",
  "L-02",
  "L-03",
  "R1-02",
  "R1-05",
  "R1-07",
  "R1-11",
  "R2-03",
  "R2-04",
  "R2-05",
  "Q-00",
  "Q-01a",
  "Q-01b",
  "Q-03",
  "Q-05",
  "X-01",
  "X-02",
  "X-03",
  "X-06",
  "X-07",
  "E-05",
];

describe("M7-exam-04 文言", () => {
  it("EXAM_TEXTS が 11-1 §2.8 の表と一致する（ほかの ID は無い）", () => {
    expect({ ...EXAM_TEXTS }).toEqual(SPEC_TEXTS);
  });
  it("やめる文言の ID が無い", () => {
    for (const id of REMOVED_IDS) expect(Object.keys(EXAM_TEXTS), id).not.toContain(id);
  });
  it("見出しは「Step 1」〜「Step 4」で「/ 5」を含まない（K-32 ①）。ラベルは「Step1」〜「Step4」", () => {
    expect([1, 2, 3, 4].map(examTextStep)).toEqual(["Step 1", "Step 2", "Step 3", "Step 4"]);
    for (const n of [1, 2, 3, 4]) expect(examTextStep(n)).not.toContain("/ 5");
    expect([1, 2, 3, 4].map(examTextStepIndicatorLabel)).toEqual([
      "Step1",
      "Step2",
      "Step3",
      "Step4",
    ]);
    expect(examTextStepLabel(2)).toBe("ステップ 2 / 4");
  });
  it("各ステップの案内文は Q-G1〜Q-G4", () => {
    expect(EXAM_STEPS.map((s) => EXAM_TEXTS[s.guideTextId])).toEqual([
      "直感的にサクサクと回答してください！",
      "出来るだけ「どちらでもない」は選ばないで",
      "今半分です！後少し頑張りましょう",
      "あまり考えすぎず直感的に答えましょう",
    ]);
  });
  it("設問の表記 Q-N と選択肢 CH-1〜CH-5", () => {
    expect(questionLabel(1, "人の好き嫌いが多い")).toBe("1. 人の好き嫌いが多い");
    // 受験画面が使う書式（exam-texts.ts）も同じ
    expect(examTextQuestion(1, "人の好き嫌いが多い")).toBe("1. 人の好き嫌いが多い");
    expect(CHOICE_OPTIONS.map((o) => o.label)).toEqual([
      "そう思う",
      "どちらかと言えばそう思う",
      "どちらでもない",
      "どちらかと言えばそう思わない",
      "そう思わない",
    ]);
  });
  it("改行で 2 文をつなぐ文言（R7-02・C-02）", () => {
    expect(EXAM_TEXTS["R7-02"].split("\n")).toEqual([
      "リンクが正しくありません。",
      "再度ご確認の上、リンクにアクセスしてください。",
    ]);
    expect(EXAM_TEXTS["C-02"].split("\n")).toEqual([
      "お疲れ様でした",
      "回答の送信が完了しました。",
    ]);
  });
});

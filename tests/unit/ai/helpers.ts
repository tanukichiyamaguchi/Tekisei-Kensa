// lib/ai の単体テストの共通部品
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildAiAnalysisInput } from "@/lib/ai/input";
import type {
  AiAnalysisInput,
  AiAnalysisOutput,
  LongitudinalAiInput,
  TrainingAiInput,
  TrainingAiOutput,
} from "@/lib/ai/types";
import { scoreAnswers } from "@/lib/scoring/score";

import { cyclicAnswers } from "../scoring/helpers";

/** 付録D §3 のリクエスト本文から system 指示とユーザー入力テンプレートを取り出す（本文は JSON 文字列のエスケープのまま） */
export function readAppendixDPrompt(): { readonly system: string; readonly user: string } {
  const md = readFileSync(path.join(process.cwd(), "docs", "付録D_AI解説仕様.md"), "utf8");
  const sysAt = md.indexOf('"text": "# あなたの役割');
  const sysStart = md.indexOf('"', md.indexOf(":", sysAt)) + 1;
  const sysEnd = md.indexOf('"\n      }\n    ]\n  },\n  "contents"', sysStart);
  const userAt = md.indexOf('"text": "【氏名】');
  const userStart = md.indexOf('"', md.indexOf(":", userAt)) + 1;
  const userEnd = md.indexOf('"\n        }\n      ]\n    }\n  ],', userStart);
  if (sysAt < 0 || sysEnd < 0 || userAt < 0 || userEnd < 0) {
    throw new Error("付録D §3 のプロンプトが見つかりません");
  }
  return { system: md.slice(sysStart, sysEnd), user: md.slice(userStart, userEnd) };
}

/**
 * 文書（docs からの相対の道筋）の節（sectionStart の見出しから sectionEnd の見出しの前まで。sectionEnd が null なら文書の終わりまで）に
 * ある「~~~~text」の囲みの中身を、出てくる順に返す（中身はそのまま。閉じる「~~~~」の前の改行を含む）
 */
export function readFencedTextBlocks(
  docPath: readonly string[],
  sectionStart: string,
  sectionEnd: string | null,
): string[] {
  const md = readFileSync(path.join(process.cwd(), "docs", ...docPath), "utf8");
  const start = md.indexOf(sectionStart);
  const end = sectionEnd === null ? md.length : md.indexOf(sectionEnd, start);
  if (start < 0 || end < 0) throw new Error(`${sectionStart} の節が見つかりません`);
  return [...md.slice(start, end).matchAll(/^~~~~text\n([\s\S]*?)^~~~~$/gm)].map((m) => m[1]!);
}

/**
 * 11-6 別表A（training-v1 の全文）の 2 つの囲みの中身。system は §A.1、user は §A.2 の囲みの中身そのまま（どちらも末尾に改行が
 * 1 つある。コードの user テンプレートはそれを除いたもの）
 */
export function readTrainingV1Appendix(): { readonly system: string; readonly user: string } {
  const blocks = readFencedTextBlocks(
    ["基本設計", "11_参照元の更新", "11-6_AI解説.md"],
    "## 別表A training-v1 の全文",
    "## 別表B longitudinal-v1 の全文",
  );
  if (blocks.length !== 2) throw new Error(`11-6 別表A の囲みが ${blocks.length} 個です`);
  return { system: blocks[0]!, user: blocks[1]! };
}

/**
 * 付録D §6（育成・定着の版 training-v1）の 2 つの囲みの中身。§6.1 の system と §6.2 の user テンプレート（11-6 別表A と同じく、どちらも
 * 末尾に改行が 1 つある）。経年比較の §7（PR-7.11b）が足されるまでは、§6 は文書の終わりまで
 */
export function readAppendixDTrainingPrompt(): { readonly system: string; readonly user: string } {
  const blocks = readFencedTextBlocks(
    ["付録D_AI解説仕様.md"],
    "## 6. 育成・定着の版（training-v1",
    null,
  );
  if (blocks.length !== 2) throw new Error(`付録D §6 の囲みが ${blocks.length} 個です`);
  return { system: blocks[0]!, user: blocks[1]! };
}

/** 03 §10.5 の T-06（周期回答）に、07 §2.4 の仮の氏名・職種を付けた入力 */
export function t06Input(overrides: Partial<AiAnalysisInput> = {}): AiAnalysisInput {
  return {
    ...buildAiAnalysisInput({
      respondentName: "山田 太郎",
      occupationCode: 2,
      score: scoreAnswers(cyclicAnswers()),
    }),
    ...overrides,
  };
}

/** 育成・定着の入力（T-06 に 11-6 §3.4 の要求の例の 8 項目を足したもの） */
export function t06TrainingInput(): TrainingAiInput {
  return {
    ...t06Input(),
    context: {
      tenure: "year_2",
      evaluation: "meets",
      expectedRole: "trainer",
      recentState: "low_energy",
      relationship: "specific_mismatch",
      wish: "skill_up",
      changeSinceJoining: "unchanged",
      concern: "few_reports",
    },
  };
}

/** 経年比較の入力（入力文は仮の値。PR-7.11b まで provider は config_error で受け付けない） */
export function longitudinalInput(): LongitudinalAiInput {
  return { userText: "【前回→今回のスコア】（テスト用の入力文）" };
}

/** 付録D §2 の形に沿った妥当な出力 */
export function validOutput(): AiAnalysisOutput {
  return {
    summary: "山田 太郎さんは、要するに現場の潤滑油になる人です。",
    verdict: { sokusenryoku: "高い", teichaku_risk: "低い", sougou: "推奨" },
    strengths: ["受付対応で丁寧さが活きる。", "滅菌作業を手順どおりに進められる。"],
    cautions: [
      "不注意からのミスに注意（不注意ミスリスク57.5）。",
      "意思決定を人に委ねがち（意思決定0）。",
    ],
    questions: [
      { q: "最近決まりを守って助かった経験は？", intent: "規則遵守の実感" },
      { q: "忙しい時の優先順位の付け方は？", intent: "段取り力" },
      { q: "ミスをした後どうしますか？", intent: "反省力" },
    ],
    retention: {
      levers: [
        { label: "関わり方", text: "週 1 回の短い面談をする。" },
        { label: "任せ方", text: "手順が明確な業務から任せる。" },
        { label: "認め方", text: "具体的な行動を褒める。" },
        { label: "伸ばし方", text: "得意な業務を広げる。" },
      ],
      sign: "報告の回数が減る。",
      action: "業務量を一緒に見直す。",
    },
  };
}

/** 11-6 §2.8.2 の形に沿った育成・定着の妥当な出力（氏名を含めない。数は各上限の内側） */
export function validTrainingOutput(): TrainingAiOutput {
  return {
    verdict: { match: "高い", risk: "中", support: "低い" },
    urgent: {
      why: "報告が少ないことと、退職トラブルのリスク（42.5）から、まず今の状況を確かめることが最優先です。",
      hypotheses: [
        { level: "高", text: "任される業務が増え、報告の時間を取れていない。" },
        { level: "中", text: "相談しにくいと感じている。" },
        { level: "診断外", text: "体調や私生活の変化。" },
      ],
      actions: [
        { label: "今週", text: "10 分の面談で最近の様子を聞く。" },
        { label: "聞き方", text: "責めずに、困っていることから聞く。" },
        { label: "", text: "報告の型を一緒に決める。" },
      ],
    },
    role: {
      why: "新人教育・指導担当に要る力 3 つのうち、2 つが備わっています。",
      have: ["正確に伝える力（規則遵守力18.5）。", "つまずきに気づく力（敏感さ16）。"],
      lack: ["間違いを正す力（謙虚さ13）。", "その場で判断する力（意思決定0。仕組みで回避）。"],
      steps: [
        {
          badge: "STEP 1",
          target: "土台づくり",
          title: "教える手順を一緒に書き出す。",
          body: "規則遵守力が高いので、手順があると力を出せます。",
          say: "「教える手順を一緒に整理しよう」",
          note: "書き出せたら次へ進みます。",
        },
        {
          badge: "STEP 2",
          target: "",
          title: "最初は責任者が横で見る。",
          body: "判断の場面は責任者が引き取ります。",
          say: "",
          note: "",
        },
      ],
      cond: "施術の技術の習得の状況は、診断では判別できません。",
    },
    daily: [
      {
        scene: "教える",
        ok: "手順を 1 つずつ示す。",
        ng: "一度に多くを伝える（覚えきれない）。",
        say: "「まずここまでやってみよう」",
      },
      { scene: "認める", ok: "具体的な行動を褒める。", ng: "曖昧に褒める。", say: "" },
    ],
    oneonone: [
      { q: "最近、困っていることはありますか。", intent: "業務量の話が出たら配分を見直す。" },
      { q: "教える役割をどう感じていますか。", intent: "負担と答えたら範囲を絞る。" },
      { q: "これから伸ばしたいことは何ですか。", intent: "答えに合わせて次の役割を相談する。" },
    ],
  };
}

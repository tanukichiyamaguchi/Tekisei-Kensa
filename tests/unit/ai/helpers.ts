// lib/ai の単体テストの共通部品
import { readFileSync } from "node:fs";
import path from "node:path";

import { buildAiAnalysisInput } from "@/lib/ai/input";
import type { AiAnalysisInput, AiAnalysisOutput } from "@/lib/ai/types";
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

// AI 解説の領域（結果詳細の #ai。11-6）の画面の文言（11-6 §2.15 が正。領域とタブの行の読み上げの名前は §2.1）。JSX に直書きせず、
// この定数を使う（06 §10.5）。T-09（採用向けの末尾）・T-18・T-29・T-30 群（AI_FAILURE_TEXTS・aiFailureText）は admin-texts.ts から
// 移した文言で、文は今のまま。T-17 は生成中の文（generating）に置き換わる（§2.3.3）。K-19 で置き換えた文言は、参照元の原文を
// コメントに残す（11-6 §0.5）。「~」は半角（§2.3.3）、「…」は U+2026 で、「◎」「△」「⚠」「＆」「！」は文字のまま書く（アイコンに
// しない。§2.14）。育成・定着の表示と 8 項目の文言（trainingView・trainingContext）は PR-7.10、経年比較の文言（longitudinal）は
// PR-7.11a・PR-7.11b が足す。画面の部品（Client Component）が読む純粋なモジュール。
// 依頼主の確認が要る文言（11-6 7 章の 5。11 総論 7 章の 21）は、確認まで仕様書の案のまま: 準備中の注記（AI_TEXTS.notReady）
import type { AiStartKind, RecruitmentChipKind } from "./ai-area";
import type { AiFailureReason } from "@/lib/ai/errors";
import type { AiAnalysisKind } from "@/lib/ai/kinds";

export const AI_TEXTS = {
  // 領域とタブの行の読み上げの名前（§2.1。section と role="tablist" の aria-label）
  area: {
    label: "AI解説",
    tabsLabel: "AI解説の種類",
  },
  // タブ（§2.2）
  tabs: {
    recruitment: "採用向けAI解説",
    training: "育成・定着AI解説",
    longitudinal: "経年比較AI解説",
  } satisfies Readonly<Record<AiAnalysisKind, string>>,
  // 生成ボタン（§2.3.2）。失敗のあとも同じ文言で作り直す（参照元に「再試行」のボタンは無い。§2.15）
  generate: {
    recruitment: "採用向けAI解説を生成",
    training: "育成・定着AI解説を生成",
  } satisfies Readonly<Record<AiStartKind, string>>,
  notReady: "この AI 解説は準備中です。", // 有効でない種類の押せない生成ボタンの下（§2.3.2。アプリだけの文）
  // 生成前の案内（§2.3.1）。見出し（.ih-t）・副題（.ih-s）・特徴 3 行（太字 .fi-t と説明 .fi-d）
  intro: {
    // 採用向け（§2.4.2）。見出しは「AI 採用アドバイザー」で、表示の見出し帯の「AI 採用・育成アドバイザー」と語が違う（参照元どおり）
    recruitment: {
      title: "AI 採用アドバイザー",
      subtitle: "診断結果を、面接と採用判断で使える形に変換します",
      features: [
        {
          title: "即戦力性・離職リスク・総合判定",
          description: "採用すべきかの判断材料を、3つの指標で提示します",
        },
        {
          title: "この人物の要約と、強み・注意点",
          description: "スコアから人物像を一言で。面接前に見極めたい点も具体的に",
        },
        {
          title: "面接で深掘りすべき質問",
          description: "その方に合わせた質問と、何を見極めるかまで提示します",
        },
      ],
    },
    // 育成・定着（§2.5.2）。枠（.need）と警告（.warn）は太字（b）の部分を strong に分けて持つ
    training: {
      title: "AI 育成・定着アドバイザー",
      subtitle: "すでに働いているスタッフを、どう育て、どう定着させるか",
      features: [
        {
          title: "すぐに手を打つべき理由と、その一手",
          description: "いま何が起きているか、今週まず何をするかを提示します",
        },
        {
          title: "期待する役割に向けて、どう育てるか",
          description: "何が足りず、どう埋めるかを順番に沿って提示します",
        },
        {
          title: "日常の接し方と、1on1で聞くこと",
          description: "そのまま使える言い方つき。○と×の形で提示します",
        },
      ],
      need: {
        before: "下の8項目にご記入いただくことで、",
        strong: "その方の今の状況に合わせた内容",
        after: "を生成します。すべて選択式で、20秒ほどで完了します。",
      },
      // mark は左の「！」の丸（.warn-i。記号だけの印で、読み上げない）
      warn: {
        mark: "！",
        before: "一度生成した内容は、",
        strong: "あとから修正できません",
        after: "。生成前に入力内容をご確認ください。",
      },
    },
  },
  // 生成中（§2.3.3。採用向けと育成・定着で同じ。T-17 を置き換える）。lines は説明の 2 行（間で改行する）
  generating: {
    title: "AIが解説を作成しています",
    lines: [
      "スコアを読み込み、人物の要約・面接のアドバイスを生成中…",
      "完了まで30~90秒ほどお待ちください",
    ],
  },
  failed: "AI解説の生成に失敗しました。", // T-18。失敗の枠では、続けて理由の文（aiFailureText）を出す（§2.3.4）
  pollingTimeout: "時間内に完了しませんでした。ページを再読み込みしてください", // T-29（読み直しが 10 分たっても終わらない。§2.3.4）
  // 採用向けの表示（§2.4.3。行末のコメントの括弧の数字は §2.4.3 の表の順）
  recruitmentView: {
    band: "AI 採用・育成アドバイザー", // 見出し帯
    // 注意書き（ai-10・compare-M1。参照元は CSS の ::before。アプリは文字の要素。K-31 ⑤）
    caution:
      "ご注意：この解説は「個人」だけを見た結果です。採用の判断では、「概要」で比較組織を選んだときに出る「組織との合致度」が高い人ほど、採用しやすい目安になります。",
    // 判定チップのラベル（並びは ai-area.ts の RECRUITMENT_CHIP_ORDER）
    chips: {
      sokusenryoku: "即戦力性",
      teichaku_risk: "離職リスク",
      sougou: "総合判定",
    } satisfies Readonly<Record<RecruitmentChipKind, string>>,
    summary: "この人物の要約", // 節の見出し（6）
    strengths: "◎ このサロンで活きる強み", // 強みの箱の見出し（7）。参照元: ◎ このクリニックで活きる強み。K-19
    cautions: "△ 採用前に見極めたい注意点", // 注意点の箱の見出し（7）
    questions: "面接で深掘りすべき質問", // 節の見出し（8）
    intentLabel: "見極め：", // 質問の intent の前（8）
    retention: "長く働いてもらうための接し方・育て方", // 節の見出し（9）
    retainAlert: "⚠ 辞めそうなサイン ＆ 引き止めの一手", // 辞めそうなサインの箱の見出し（10）
    sign: "サイン", // 札（10）
    action: "一手", // 札（10）
    // 末尾（11。T-09）。参照元: …生成結果は院長が内容をご確認のうえご活用ください。K-19
    footer:
      "※ 診断スコア（16特性・ソーシャルスタイル・リスク指標）をもとにAIが自動生成しています。生成結果は責任者が内容をご確認のうえご活用ください。",
    empty: "-", // 値が空の文字のとき（判定チップの値を含む。§2.4.3・§2.4.4）
  },
} as const;

/** AI 解説の失敗理由コード → 表示文言（06 §3.5.9 の T-30 群。語彙は 07 §4.6 の AiFailureReason + 04 §5.9 の internal_error） */
export const AI_FAILURE_TEXTS: Readonly<Record<AiFailureReason | "internal_error", string>> = {
  provider_error: "AI サービスとの通信に失敗しました。時間をおいて再試行してください",
  rate_limited: "AI サービスが混み合っています。時間をおいて再試行してください",
  invalid_request: "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
  auth_error: "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
  config_error: "AI 連携の設定に問題があります。運用担当者にお問い合わせください",
  timeout: "生成に時間がかかりすぎたため中断しました。再試行してください",
  invalid_json: "AI の応答を解釈できませんでした。再試行してください",
  truncated: "AI の応答を解釈できませんでした。再試行してください",
  refusal: "AI が解説の生成を行いませんでした。再試行してください",
  internal_error: "生成処理でエラーが発生しました。再試行してください",
};

/** X-12: 未知の値・null は internal_error と同じ既定文言（理由コードをそのまま見せない） */
export function aiFailureText(code: string | null): string {
  if (code !== null && Object.hasOwn(AI_FAILURE_TEXTS, code)) {
    return AI_FAILURE_TEXTS[code as keyof typeof AI_FAILURE_TEXTS];
  }
  return AI_FAILURE_TEXTS.internal_error;
}

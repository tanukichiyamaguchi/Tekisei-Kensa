// recruitment-v2: アイリストのサロン向けのプロンプト（10 K-19。07 §2.2 の「文言を変える場合は版を追加する」に従う）。
// recruitment-v1（付録D §3 の転記）から、歯科クリニック向けの文脈だけを置き換えたもの。判定基準・辞書・出力形式は v1 と同じ。
// 置き換えは RECRUITMENT_V2_REPLACEMENTS の各行が v1 の本文にちょうど 1 回ずつ現れることを確かめてから行う
// （v1 の本文が変わって置き換え漏れが起きたら、読み込み時に例外で止める）。
import { RECRUITMENT_V1_SYSTEM, RECRUITMENT_V1_USER_TEMPLATE } from "./recruitment-v1";
import type { PromptDefinition } from "./types";

/** v1 → v2 の置き換え（[v1 の文字列, v2 の文字列]）。付録D §5 に同じ表を載せる */
export const RECRUITMENT_V2_REPLACEMENTS: readonly (readonly [string, string])[] = [
  [
    "あなたは、歯科クリニックの採用と人材定着を支援する専門アドバイザーAIです。",
    "あなたは、アイリスト（まつげエクステ・まつげパーマなどの施術者）が働く美容サロンの採用と人材定着を支援する専門アドバイザーAIです。",
  ],
  ["HRの専門家ではなく多忙な院長が", "HRの専門家ではなく多忙なサロンの責任者が"],
  ["7. 院長が3分で読み切れる分量に抑える。", "7. 責任者が3分で読み切れる分量に抑える。"],
  ["ただし判定は院長の採用判断の材料になる。", "ただし判定は責任者の採用判断の材料になる。"],
  [
    "その職種の具体的な業務名（例：滅菌作業、在庫管理、受付対応、アシスト業務など）に落として書く。",
    "その職種の具体的な業務名（例：まつげエクステの施術、カウンセリング、デザイン提案、衛生管理、予約・受付対応、次回予約の提案、店販、SNS発信など）に落として書く。",
  ],
  [
    "・院長が現場をイメージできる、具体的な言葉を選ぶ。",
    "・責任者がサロンの現場をイメージできる、具体的な言葉を選ぶ。\n・サロンでは、施術の技術と正確さに加えて、お客様との会話・カウンセリング、指名やリピートにつながる接客、衛生管理が成果を左右する。これらの観点で職種との相性を読む。",
  ],
];

function applyReplacements(
  source: string,
  replacements: typeof RECRUITMENT_V2_REPLACEMENTS,
): string {
  let text = source;
  for (const [from, to] of replacements) {
    const count = text.split(from).length - 1;
    if (count !== 1) {
      throw new Error(`recruitment-v2: 置き換え元が ${count} 回見つかりました: ${from}`);
    }
    text = text.replace(from, to);
  }
  return text;
}

export const RECRUITMENT_V2: PromptDefinition = {
  version: "recruitment-v2",
  analysisKind: "recruitment",
  system: applyReplacements(RECRUITMENT_V1_SYSTEM, RECRUITMENT_V2_REPLACEMENTS),
  userTemplate: RECRUITMENT_V1_USER_TEMPLATE,
};

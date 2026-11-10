// 回答リンクのコピー（11-2 §2.17）。見出しの「回答リンクをコピー」・リンクのメニューの項目・0 件の表示のボタン（§2.19）が使う補助。
// クリップボード・安全な接続かどうか・window.prompt・通知は呼ぶ側が env で渡す（M7-list-19 の単体テストで差し替える）
import { RESULT_LIST_TEXTS, type ResultListLinkKind } from "@/lib/presentation/result-list-texts";

export interface CopyLinkEnv {
  /** navigator.clipboard（使えない環境では undefined） */
  readonly clipboard: { readonly writeText: (text: string) => Promise<void> } | undefined;
  /** window.isSecureContext */
  readonly isSecureContext: boolean;
  /** window.prompt（リンクを見せて手でコピーしてもらう） */
  readonly prompt: (message: string, value: string) => void;
  /** 通知（Toast の情報の通知） */
  readonly notify: (message: string) => void;
}

/**
 * リンクをコピーする。リンクが空なら通知「リンクを用意できませんでした」。クリップボードが使え安全な接続なら書き込み、
 * 成功したら通知「{種類}をコピーしました」。使えない・書き込みに失敗したときは window.prompt で「{種類}（コピーしてください）」とリンクを見せる
 */
export async function copyResultListLink(
  kind: ResultListLinkKind,
  link: string | null | undefined,
  env: CopyLinkEnv,
): Promise<void> {
  if (link === null || link === undefined || link === "") {
    env.notify(RESULT_LIST_TEXTS.toast.linkMissing);
    return;
  }
  if (env.clipboard !== undefined && env.isSecureContext) {
    try {
      await env.clipboard.writeText(link);
      env.notify(RESULT_LIST_TEXTS.toast.linkCopied(kind));
      return;
    } catch {
      // 書き込めない（権限が無いなど）ときは下の prompt で見せる
    }
  }
  env.prompt(RESULT_LIST_TEXTS.copyPrompt(kind), link);
}

/** 「回答リンクをコピー」を押したときの動き。オーナーはリンクのメニュー、オーナー以外はすぐ求職者用をコピー（§2.4・§2.17） */
export function linkButtonAction(canViewExecutives: boolean): "menu" | "copy_applicant" {
  return canViewExecutives ? "menu" : "copy_applicant";
}

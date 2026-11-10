"use client";
// 回答一覧の見出し行（11-2 §2.4・§2.17）。見出し「回答一覧」と説明、「利用履歴」（利用履歴のポップアップ）と「回答リンクをコピー」。
// オーナーは右端に下向きの山を付けてリンクのメニューを開き、オーナー以外は押すとすぐ求職者用の回答リンクをコピーする。
// 通知・メニュー・ポップアップは ResultsView が出す。data-rl-menu-toggle はメニューの外を押して閉じたときに続く click を止める目印（§2.12）
import { useId } from "react";

import { linkButtonAction } from "./copy-link";
import { ChevronDownIcon, ClockIcon, LinkIcon } from "./icons";
import { ADMIN_TEXTS } from "@/lib/presentation/admin-texts";
import { RESULT_LIST_TEXTS } from "@/lib/presentation/result-list-texts";

export function ListHeader(props: {
  readonly canViewExecutives: boolean;
  readonly onOpenUsageLogs: () => void;
  /** オーナーの「回答リンクをコピー」。押したボタンを渡す（メニューの位置と、閉じたあとの焦点の戻り先） */
  readonly onOpenLinkMenu: (anchor: HTMLElement) => void;
  /** オーナー以外の「回答リンクをコピー」（すぐ求職者用をコピー） */
  readonly onCopyApplicantLink: () => void;
}) {
  const linkButtonId = useId();
  const withMenu = linkButtonAction(props.canViewExecutives) === "menu";
  return (
    <div className="rl-head">
      <div className="rl-head__text">
        <h1 className="rl-title">{RESULT_LIST_TEXTS.title}</h1>
        <p className="rl-desc">{RESULT_LIST_TEXTS.description}</p>
      </div>
      <div className="rl-head__actions">
        <button type="button" className="rl-btn rl-btn--plain" onClick={props.onOpenUsageLogs}>
          <ClockIcon />
          {ADMIN_TEXTS.usageLogs}
        </button>
        {withMenu ? (
          <button
            type="button"
            id={linkButtonId}
            className="rl-btn rl-btn--primary"
            aria-haspopup="menu"
            data-rl-menu-toggle=""
            onClick={(event) => props.onOpenLinkMenu(event.currentTarget)}
          >
            <LinkIcon />
            {RESULT_LIST_TEXTS.copyLink}
            <ChevronDownIcon />
          </button>
        ) : (
          <button
            type="button"
            id={linkButtonId}
            className="rl-btn rl-btn--primary"
            onClick={props.onCopyApplicantLink}
          >
            <LinkIcon />
            {RESULT_LIST_TEXTS.copyLink}
          </button>
        )}
      </div>
    </div>
  );
}

// M7-list-19 回答リンクのコピー（11-2 §2.4・§2.17）。コピーの処理は部品の補助（components/admin/results/copy-link.ts）の
// env を差し込んで確かめ、見出し行（ListHeader）の描いた HTML は renderToStaticMarkup で確かめる（DOM のライブラリを足さない。
// M7-exam-14 と同じ書き方）。押したときの動き（メニューを開く・すぐコピーする・通知）は E2E（M7-list-34・35・47）
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  copyResultListLink,
  linkButtonAction,
  type CopyLinkEnv,
} from "@/components/admin/results/copy-link";
import { ListHeader } from "@/components/admin/results/ListHeader";

const LINK = "http://localhost:3000/exam?q=org-example&p=user";

function envOf(overrides: Partial<CopyLinkEnv> = {}) {
  const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
  const prompt = vi.fn<(message: string, value: string) => void>();
  const notify = vi.fn<(message: string) => void>();
  const env: CopyLinkEnv = {
    clipboard: { writeText },
    isSecureContext: true,
    prompt,
    notify,
    ...overrides,
  };
  return { env, writeText, prompt, notify };
}

describe("M7-list-19 copyResultListLink", () => {
  it("クリップボードが使え安全な接続なら書き込み、成功で通知「{種類}をコピーしました」", async () => {
    const { env, writeText, prompt, notify } = envOf();
    await copyResultListLink("applicant", LINK, env);
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(notify).toHaveBeenCalledWith("求職者用の回答リンクをコピーしました");
    expect(prompt).not.toHaveBeenCalled();

    const executive = envOf();
    await copyResultListLink("executive", LINK, executive.env);
    expect(executive.notify).toHaveBeenCalledWith("既存スタッフ用の回答リンクをコピーしました");
  });

  it("書き込みに失敗したら window.prompt に「{種類}（コピーしてください）」とリンク。通知は出さない", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    const { env, prompt, notify } = envOf({ clipboard: { writeText } });
    await copyResultListLink("executive", LINK, env);
    expect(writeText).toHaveBeenCalledWith(LINK);
    expect(prompt).toHaveBeenCalledWith("既存スタッフ用の回答リンク（コピーしてください）", LINK);
    expect(notify).not.toHaveBeenCalled();
  });

  it("安全でない接続・クリップボードが無いときは書き込まずに window.prompt", async () => {
    const insecure = envOf({ isSecureContext: false });
    await copyResultListLink("applicant", LINK, insecure.env);
    expect(insecure.writeText).not.toHaveBeenCalled();
    expect(insecure.prompt).toHaveBeenCalledWith(
      "求職者用の回答リンク（コピーしてください）",
      LINK,
    );

    const missing = envOf({ clipboard: undefined });
    await copyResultListLink("applicant", LINK, missing.env);
    expect(missing.prompt).toHaveBeenCalledWith("求職者用の回答リンク（コピーしてください）", LINK);
    expect(missing.notify).not.toHaveBeenCalled();
  });

  it("リンクが空なら通知「リンクを用意できませんでした」で、書き込みも prompt もしない", async () => {
    for (const link of ["", null, undefined]) {
      const { env, writeText, prompt, notify } = envOf();
      await copyResultListLink("applicant", link, env);
      expect(notify).toHaveBeenCalledWith("リンクを用意できませんでした");
      expect(writeText).not.toHaveBeenCalled();
      expect(prompt).not.toHaveBeenCalled();
    }
  });
});

describe("M7-list-19 「回答リンクをコピー」の動き（linkButtonAction と ListHeader）", () => {
  const render = (canViewExecutives: boolean) =>
    renderToStaticMarkup(
      createElement(ListHeader, {
        canViewExecutives,
        onOpenUsageLogs: () => undefined,
        onOpenLinkMenu: () => undefined,
        onCopyApplicantLink: () => undefined,
      }),
    );
  /** 「回答リンクをコピー」のボタンの HTML */
  const copyButton = (html: string) => {
    const buttons = html.match(/<button[\s\S]*?<\/button>/g) ?? [];
    const found = buttons.find((b) => b.includes("回答リンクをコピー"));
    if (!found) throw new Error("回答リンクをコピーのボタンがありません");
    return found;
  };

  it("オーナーはメニュー、オーナー以外はすぐ求職者用をコピー", () => {
    expect(linkButtonAction(true)).toBe("menu");
    expect(linkButtonAction(false)).toBe("copy_applicant");
  });

  it("オーナーは aria-haspopup=menu と下向きの山（M6 9l6 6 6-6）。オーナー以外はどちらも無い", () => {
    const owner = copyButton(render(true));
    expect(owner).toContain('aria-haspopup="menu"');
    expect(owner).toContain('d="M6 9l6 6 6-6"');
    const admin = copyButton(render(false));
    expect(admin).not.toContain("aria-haspopup");
    expect(admin).not.toContain('d="M6 9l6 6 6-6"');
    // どちらもリンクのアイコンと、見出し・説明・「利用履歴」を描く
    for (const html of [render(true), render(false)]) {
      expect(copyButton(html)).toContain('d="M10 13a5 5 0 0 0 7.54.54l3-3');
      expect(html).toContain('<h1 class="rl-title">回答一覧</h1>');
      expect(html).toContain(
        "受験した人の診断結果を開けます。同じ人の受験は1行にまとめ、最新の受験を表示しています。",
      );
      expect(html).toMatch(
        /<button type="button" class="rl-btn rl-btn--plain">[\s\S]*利用履歴<\/button>/,
      );
    }
  });
});

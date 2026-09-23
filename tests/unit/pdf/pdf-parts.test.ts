// U-14（visibilityForMode。07 §9.5、D07-15、06 D06-26）と lib/pdf の小さな部品（印刷 URL、ヘッダー・フッター）
import { describe, expect, it } from "vitest";

import { buildPrintUrl } from "@/lib/pdf/print-url";
import { protectionBypassHeaders } from "@/lib/pdf/protection-bypass";
import { buildPageMarginCss, cssString, RESTRICTED_FOOTER_NOTE } from "@/lib/pdf/templates";
import { FULL_VISIBILITY, visibilityForMode } from "@/lib/pdf/visibility";

describe("U-14 visibilityForMode", () => {
  it("restricted: 評価・合致度・リスク・AI 解説を非表示、立ち位置は表示（D06-26）", () => {
    expect(visibilityForMode("restricted", true)).toEqual({
      showGrade: false,
      showMatchScore: false,
      showRisks: false,
      showPosition: true,
      showAiAnalysis: false,
    });
  });

  it("full: すべて表示。AI 解説は completed のときだけ", () => {
    expect(visibilityForMode("full", true)).toEqual(FULL_VISIBILITY);
    expect(visibilityForMode("full", false)).toEqual({ ...FULL_VISIBILITY, showAiAnalysis: false });
    expect(visibilityForMode("restricted", false).showAiAnalysis).toBe(false);
  });
});

describe("buildPrintUrl", () => {
  it("mode・scope・teamCode・token をクエリにする", () => {
    const url = new URL(
      buildPrintUrl("https://example.com/", "Res1", "full", { kind: "team", teamCode: "C" }, "a.b"),
    );
    expect(url.origin).toBe("https://example.com");
    expect(url.pathname).toBe("/admin/results/Res1/print");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      mode: "full",
      scope: "team",
      teamCode: "C",
      token: "a.b",
    });
  });

  it("scope なしは mode と token だけ。組織全体は teamCode を付けない", () => {
    const none = new URL(buildPrintUrl("http://localhost:3000", "R", "restricted", null, "t"));
    expect(Object.fromEntries(none.searchParams)).toEqual({ mode: "restricted", token: "t" });
    const org = new URL(
      buildPrintUrl("http://localhost:3000", "R", "full", { kind: "organization" }, "t"),
    );
    expect(Object.fromEntries(org.searchParams)).toEqual({
      mode: "full",
      scope: "organization",
      token: "t",
    });
  });
});

describe("ヘッダー・フッター（@page マージンボックス。07 §9.5）", () => {
  const args = {
    headerText: '山田 "太郎" </style><script> 様の診断結果',
    submittedAtText: "2026/09/17 10:30",
    generatedAtText: "2026/09/23 12:00",
    mode: "full" as const,
  };

  it("差し込む文字列は CSS 文字列としてエスケープし、</style> で抜け出せない", () => {
    const css = buildPageMarginCss(args);
    expect(css).not.toContain("</style>");
    expect(css).not.toContain("<script>");
    expect(css).toContain("\\22 太郎\\22 ");
    expect(cssString('a"b\\c<d>\ne')).toBe('"a\\22 b\\5C c\\3C d\\3E \\A e"');
  });

  it("回答日時・出力日時・ページ番号。restricted のときだけ非表示の注記", () => {
    const full = buildPageMarginCss(args);
    expect(full).toContain('@top-right { content: "回答日時 2026/09/17 10:30";');
    expect(full).toContain('@bottom-left { content: "出力日時 2026/09/23 12:00";');
    expect(full).toContain('counter(page) " / " counter(pages)');
    expect(full).toContain('font-family: "Noto Sans JP"');
    expect(full).not.toContain(RESTRICTED_FOOTER_NOTE);
    expect(buildPageMarginCss({ ...args, mode: "restricted" })).toContain(
      `@bottom-right { content: "${RESTRICTED_FOOTER_NOTE}";`,
    );
  });
});

describe("protectionBypassHeaders（07 §9.13）", () => {
  it("値があるときだけヘッダーを付ける", () => {
    expect(protectionBypassHeaders({ VERCEL_AUTOMATION_BYPASS_SECRET: "secret" })).toEqual({
      "x-vercel-protection-bypass": "secret",
    });
    expect(protectionBypassHeaders({ VERCEL_AUTOMATION_BYPASS_SECRET: undefined })).toEqual({});
  });
});

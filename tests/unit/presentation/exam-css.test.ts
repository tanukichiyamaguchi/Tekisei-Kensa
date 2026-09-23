// 05/T-16 の非テキストコントラストの担保: トークン値を固定し、枠線トークンの使い分けを検査する（05 §2.5 D05-35）
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const css = readFileSync(
  fileURLToPath(new URL("../../../app/(respondent)/exam.css", import.meta.url)),
  "utf8",
).replace(/\/\*[\s\S]*?\*\//g, "");

/** セレクタ → 宣言（入れ子の @media の中身も同じ形で拾う） */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selector: (m[1] ?? "").trim(),
  body: m[2] ?? "",
}));

describe("05/T-16 受検者画面のトークン", () => {
  it("§2.5 のトークン値", () => {
    const tokens = Object.fromEntries(
      [...css.matchAll(/(--[a-z-]+):\s*([^;]+);/g)].map((m) => [m[1], (m[2] ?? "").trim()]),
    );
    expect(tokens).toMatchObject({
      "--color-bg": "#f3f5f8",
      "--color-surface": "#ffffff",
      "--color-text": "#1f2933",
      "--color-text-muted": "#52606d",
      "--color-border": "#cbd2d9",
      "--color-border-input": "#6b7785",
      "--color-primary": "#0b5cad",
      "--color-primary-soft": "#e6f0fa",
      "--color-danger": "#c62828",
      "--color-danger-soft": "#fdecea",
      "--color-success": "#1b7f4b",
      "--tap-min": "48px",
      "--content-max-width": "640px",
      "--gutter": "16px",
    });
  });

  it("入力欄・select・選択肢カード・ラジオ行の枠線は --color-border-input", () => {
    for (const selector of [".exam-input", ".exam-choice", ".exam-radio-row"]) {
      const rule = rules.find((r) => r.selector === selector);
      expect(rule?.body, selector).toMatch(/border:\s*1px solid var\(--color-border-input\)/);
    }
  });

  it("装飾用の --color-border は外形線・区切り線・進捗バーのトラックにだけ使う", () => {
    const decorative = new Set([
      ".exam-header",
      ".exam-resume",
      ".exam-question",
      ".exam-nav",
      ".exam-progress-bar progress",
      ".exam-progress-bar progress::-webkit-progress-bar",
    ]);
    const users = rules.filter((r) => /var\(--color-border\)/.test(r.body)).map((r) => r.selector);
    expect(users.length).toBeGreaterThan(0);
    for (const selector of users) expect(decorative, selector).toContain(selector);
  });

  it("タップ領域は 48 px 以上（ボタン・入力欄・選択肢）", () => {
    for (const selector of [".exam-button", ".exam-input", ".exam-choice", ".exam-radio-row"]) {
      const rule = rules.find((r) => r.selector === selector);
      expect(rule?.body, selector).toMatch(/min-height:\s*var\(--tap-min\)/);
    }
  });
});

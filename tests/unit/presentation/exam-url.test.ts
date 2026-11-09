// M7-exam-06 受験リンクの「amp;」（11-1 §2.2.1）
import { describe, expect, it } from "vitest";

import { stripAmpFromSearchParams } from "@/lib/presentation/exam-url";

describe("M7-exam-06 stripAmpFromSearchParams", () => {
  it("キーの「amp;」を取り除く", () => {
    expect(stripAmpFromSearchParams({ q: "Abc", "amp;p": "user" })).toBe("q=Abc&p=user");
  });
  it("重なった「amp;amp;」と、ほかのパラメータの「amp;」もすべて取り除く", () => {
    expect(
      stripAmpFromSearchParams({ q: "Abc", "amp;amp;p": "executives", "amp;prev": "R1" }),
    ).toBe("q=Abc&p=executives&prev=R1");
  });
  it("値の「amp;」も取り除く", () => {
    expect(stripAmpFromSearchParams({ q: "Abcamp;", p: "amp;user" })).toBe("q=Abc&p=user");
  });
  it("「amp;」が無ければ null（リダイレクトしない）", () => {
    expect(stripAmpFromSearchParams({ q: "Abc", p: "executives" })).toBeNull();
    expect(stripAmpFromSearchParams({})).toBeNull();
    expect(stripAmpFromSearchParams({ q: ["a", "b"], p: undefined })).toBeNull();
  });
  it("配列の値は要素ごとに除いて同じ名前で並べ、undefined の値は落とす", () => {
    expect(stripAmpFromSearchParams({ "amp;q": ["a", "bamp;"], p: undefined, x: "1" })).toBe(
      "q=a&q=b&x=1",
    );
  });
  it("値はクエリの形に符号化する", () => {
    expect(stripAmpFromSearchParams({ "amp;p": "a b&c" })).toBe("p=a+b%26c");
  });
});

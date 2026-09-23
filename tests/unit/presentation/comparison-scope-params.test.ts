// X-09（06 §10.6）
import { describe, expect, it } from "vitest";

import {
  fromSelectValue,
  parseComparisonScope,
  TEAM_CODES,
  teamLabel,
  toComparisonQuery,
  toSelectValue,
} from "@/lib/presentation/comparison-scope-params";

describe("X-09 比較範囲の URL 変換", () => {
  it("有効な値", () => {
    expect(parseComparisonScope({ scope: "organization" })).toEqual({ kind: "organization" });
    expect(parseComparisonScope({ scope: "team", teamCode: "Z" })).toEqual({
      kind: "team",
      teamCode: "Z",
    });
  });
  it.each([
    [{ scope: "team" }],
    [{ scope: "team", teamCode: "a" }],
    [{ scope: "team", teamCode: "AA" }],
    [{ scope: "all" }],
    [{}],
  ])("無効な値 %j は null", (params) => {
    expect(parseComparisonScope(params)).toBeNull();
  });
  it("クエリ文字列とプルダウン値の往復", () => {
    expect(toComparisonQuery(null)).toBe("");
    expect(toComparisonQuery({ kind: "organization" })).toBe("scope=organization");
    expect(toComparisonQuery({ kind: "team", teamCode: "B" })).toBe("scope=team&teamCode=B");
    for (const scope of [
      null,
      { kind: "organization" } as const,
      { kind: "team", teamCode: "Q" } as const,
    ]) {
      expect(fromSelectValue(toSelectValue(scope))).toEqual(scope);
    }
    expect(fromSelectValue("team:aa")).toBeNull();
    expect(fromSelectValue("bogus")).toBeNull();
  });
  it("チームは A〜Z の 26 件、表示名は「Aチーム」", () => {
    expect(TEAM_CODES).toHaveLength(26);
    expect(TEAM_CODES[0]).toBe("A");
    expect(TEAM_CODES[25]).toBe("Z");
    expect(teamLabel("C")).toBe("Cチーム");
  });
});

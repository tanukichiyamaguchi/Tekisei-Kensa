// 受験者登録（/・/exam）の共通の処理と、M7 より前の受験画面の URL のリダイレクト（11-1 §2.1.1・§2.2.1・§3.6）。
// 画面の E2E（M7-exam-43・45・47）の前提になるサーバ側の判定を、ページの関数を直接呼んで確かめる
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import LegacyQuestionsPage from "@/app/(respondent)/exam/[sessionId]/questions/[...legacy]/page";
import { renderRegistrationPage } from "@/app/(respondent)/registration-page";
import type { RegistrationFormProps } from "@/components/respondent/RegistrationForm";

/** redirect() が投げる例外の行き先（digest は "NEXT_REDIRECT;{type};{url};{status};"） */
async function redirectedTo(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  const digest = (error as { digest?: unknown } | null)?.digest;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) {
    throw new Error(`リダイレクトしませんでした: ${String(error)}`);
  }
  return digest.split(";")[2] ?? "";
}

async function formProps(
  path: "/" | "/exam",
  params: Record<string, string | string[] | undefined>,
): Promise<RegistrationFormProps> {
  const element = (await renderRegistrationPage(
    path,
    Promise.resolve(params),
  )) as ReactElement<RegistrationFormProps>;
  return element.props;
}

describe("受験者登録（R-01）の共通の処理", () => {
  it("「amp;」を含むクエリは、取り除いたクエリで同じパスへリダイレクトする（M7-exam-43 の前提）", async () => {
    expect(
      await redirectedTo(
        renderRegistrationPage("/exam", Promise.resolve({ q: "Abc", "amp;p": "executives" })),
      ),
    ).toBe("/exam?q=Abc&p=executives");
    expect(
      await redirectedTo(renderRegistrationPage("/", Promise.resolve({ "amp;q": "Abc" }))),
    ).toBe("/?q=Abc");
  });

  it("q は文書 ID の形のときだけ組織 ID として渡し（存在は確かめない）、無い・形が違う・複数は null", async () => {
    expect(await formProps("/exam", { q: "OrgExample0000000001", p: "user" })).toEqual({
      organizationId: "OrgExample0000000001",
      kind: "applicant",
    });
    for (const q of [undefined, "", "a/b", "a".repeat(129), ["Abc", "Def"]]) {
      expect((await formProps("/exam", { q })).organizationId, String(q)).toBeNull();
    }
  });

  it("p は executives のときだけ既存スタッフ（複数・ほかの値・無しは求職者）。/ でも同じ", async () => {
    expect((await formProps("/exam", { q: "Abc", p: "executives" })).kind).toBe("executive");
    expect((await formProps("/", { q: "Abc", p: "executives" })).kind).toBe("executive");
    for (const p of [undefined, "user", "x", "EXECUTIVES", ["executives", "user"]]) {
      expect((await formProps("/exam", { q: "Abc", p })).kind, String(p)).toBe("applicant");
    }
    expect(await formProps("/", {})).toEqual({ organizationId: null, kind: "applicant" });
  });
});

describe("M7 より前の受験画面の URL（/exam/{sessionId}/questions/{何か}）", () => {
  it("/exam/{sessionId}/questions へリダイレクトする（M7-exam-47 の前提）", async () => {
    for (const legacy of [["3"], ["20"], ["x", "y"]]) {
      expect(
        await redirectedTo(
          LegacyQuestionsPage({ params: Promise.resolve({ sessionId: "Session0001", legacy }) }),
        ),
      ).toBe("/exam/Session0001/questions");
    }
  });
});

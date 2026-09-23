// 結合テスト用のデータ作成（08 §3.3.2）。本番と同じリポジトリ関数・Route Handler を通して作る
import { POST as postSession } from "@/app/auth/session/route";
import { createAdminAccount } from "@/lib/auth/admin-accounts";
import { issueRespondentToken } from "@/lib/auth/respondent-token";
import { createOrganization } from "@/lib/db/repositories/organizations-repository";
import { saveAnswers, submitSession } from "@/lib/db/repositories/assessment-sessions-repository";
import { registerRespondent } from "@/lib/db/repositories/respondents-repository";
import type { AdminRole, RespondentKind } from "@/lib/db/types";
import { adminAuth } from "@/lib/firebase/admin";
import { getExamPage } from "@/lib/presentation/exam-pages";
import type { AnswerMap, ChoiceCode, QuestionNo } from "@/lib/scoring/types";

import { signInWithPassword } from "./emulator";
import { callRoute, cookieHeaderFrom } from "./routes";

export const TEST_PASSWORD = "test-password-1234";
let counter = 0;
export const uniqueEmail = (prefix: string) => `${prefix}-${Date.now()}-${++counter}@example.com`;

export interface TestOrganization {
  readonly organizationId: string;
  readonly inviteToken: string;
}
export interface TestAdmin {
  readonly uid: string;
  readonly email: string;
  readonly cookieHeader: string;
}

export async function createTestOrganization(name = "テスト歯科医院"): Promise<TestOrganization> {
  return createOrganization({ name, code: null, customerNumber: null });
}

/** ID トークン → POST /auth/session の経路で Cookie を作る */
export async function loginAs(email: string, password = TEST_PASSWORD): Promise<string> {
  const idToken = await signInWithPassword(email, password);
  const res = await callRoute(postSession, {
    method: "POST",
    url: "/auth/session",
    body: { idToken },
  });
  if (res.status !== 200) throw new Error(`POST /auth/session が ${res.status} を返しました`);
  const cookie = cookieHeaderFrom(res, "admin_session");
  if (!cookie) throw new Error("セッション Cookie が発行されませんでした");
  return cookie;
}

/** createAdminAccount（本番と同じ関数）で管理者を作り、パスワードを設定してログインする */
export async function createAdmin(
  org: TestOrganization,
  role: AdminRole,
  displayName = "テスト管理者",
): Promise<TestAdmin> {
  const email = uniqueEmail(role);
  const { uid } = await createAdminAccount({
    email,
    displayName,
    organizationId: org.organizationId,
    role,
    actorKind: "system",
  });
  await adminAuth().updateUser(uid, { password: TEST_PASSWORD });
  return { uid, email, cookieHeader: await loginAs(email) };
}

export async function createOrganizationWithOwner(name?: string) {
  const org = await createTestOrganization(name);
  const owner = await createAdmin(org, "owner");
  return { org, owner };
}

export function uniformAnswers(choice: ChoiceCode): AnswerMap {
  const answers: Record<QuestionNo, ChoiceCode> = {};
  for (let q = 1; q <= 144; q += 1) answers[q] = choice;
  return answers;
}

/** 周期回答 Q(q) = ((q − 1) mod 5) + 1（03 §10.5 の T-06） */
export function cyclicAnswers(): AnswerMap {
  const answers: Record<QuestionNo, ChoiceCode> = {};
  for (let q = 1; q <= 144; q += 1) answers[q] = (((q - 1) % 5) + 1) as ChoiceCode;
  return answers;
}

export const meta = { ipAddress: "203.0.113.10", userAgent: "vitest" } as const;

/** リポジトリ関数で登録 → 20 ページ保存 → 送信する（受検者 API は M3 で追加する） */
export async function submitAnswerSet(
  org: TestOrganization,
  answers: AnswerMap,
  options: { readonly kind?: RespondentKind; readonly name?: string } = {},
): Promise<{
  readonly respondentId: string;
  readonly sessionId: string;
  readonly resultId: string;
  readonly usageLogId: string;
}> {
  const token = issueRespondentToken(new Date());
  const registered = await registerRespondent({
    organizationId: org.organizationId,
    kind: options.kind ?? "applicant",
    name: options.name ?? "テスト 太郎",
    phoneNumber: "090-0000-0000",
    occupationCode: 2,
    diagnosisExperience: "first_time",
    sessionTokenHash: token.tokenHash,
    tokenExpiresAt: token.expiresAt,
    meta,
  });
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const page: Record<number, ChoiceCode> = {};
    for (const q of getExamPage(pageNo).questions) {
      const v = answers[q.questionNo];
      if (v !== undefined) page[q.questionNo] = v;
    }
    if (Object.keys(page).length === 0) continue;
    await saveAnswers({
      sessionId: registered.sessionId,
      answers: page,
      lastSavedPageNo: pageNo,
      tokenExpiresAt: token.expiresAt,
    });
  }
  const submitted = await submitSession({ sessionId: registered.sessionId, meta });
  return { ...registered, resultId: submitted.resultId };
}

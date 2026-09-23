// 結合テスト用のデータ作成（08 §3.3.2）。本番と同じリポジトリ関数・Route Handler を通して作る
import { POST as postSession } from "@/app/auth/session/route";
import { createAdminAccount } from "@/lib/auth/admin-accounts";
import { createOrganization } from "@/lib/db/repositories/organizations-repository";
import type { AdminRole, RespondentKind } from "@/lib/db/types";
import { adminAuth } from "@/lib/firebase/admin";
import type { AnswerMap, ChoiceCode, QuestionNo } from "@/lib/scoring/types";

import { signInWithPassword } from "./emulator";
import { getDocForTest } from "./firestore";
import { completeViaApi } from "./respondent-api";
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

/** 受検者 API で登録 → 開始 → 20 ページ保存 → 送信する（08 §3.3.2: results に直接書かない） */
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
  const { sessionId } = await completeViaApi(org.organizationId, answers, options);
  // 受検者 API は respondentId・resultId を返さない（04 §4.5）ため、テストの観察用に文書から引く
  const session = await getDocForTest<{ respondentId: string; resultId: string }>(
    "assessmentSessions",
    sessionId,
  );
  const respondent = await getDocForTest<{ usageLogId: string }>(
    "respondents",
    session!.respondentId,
  );
  return {
    respondentId: session!.respondentId,
    sessionId,
    resultId: session!.resultId,
    usageLogId: respondent!.usageLogId,
  };
}

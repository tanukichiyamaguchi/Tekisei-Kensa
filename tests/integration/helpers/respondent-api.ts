// 受検者 API（04 §4）を Route Handler 経由で呼ぶ（08 §3.3.2: 母集団のデータも API 経由で投入する）
import { GET as getOrganizationRoute } from "@/app/api/v1/respondent/organizations/[organizationId]/route";
import { PUT as putAnswersRoute } from "@/app/api/v1/respondent/sessions/[sessionId]/answers/route";
import { GET as getSessionRoute } from "@/app/api/v1/respondent/sessions/[sessionId]/route";
import { POST as postStartRoute } from "@/app/api/v1/respondent/sessions/[sessionId]/start/route";
import { POST as postSubmitRoute } from "@/app/api/v1/respondent/sessions/[sessionId]/submit/route";
import { POST as postSessionsRoute } from "@/app/api/v1/respondent/sessions/route";
import { RESPONDENT_COOKIE_NAME } from "@/lib/auth/respondent-token";
import type { RespondentKind } from "@/lib/db/types";
import { getExamPage } from "@/lib/presentation/exam-pages";
import type { SessionCreatedDto } from "@/lib/services/dto/respondent";
import type { AnswerMap } from "@/lib/scoring/types";

import { callRoute, cookieHeaderFrom } from "./routes";

export interface RegistrationBody {
  readonly organizationId: string;
  readonly kind?: RespondentKind;
  readonly name?: string;
  readonly phoneNumber?: string;
  readonly occupationCode?: number;
  readonly diagnosisExperience?: "first_time" | "experienced";
}

export function registrationBody(body: RegistrationBody): Record<string, unknown> {
  return {
    kind: "applicant",
    name: "テスト 太郎",
    phoneNumber: "090-0000-0000",
    occupationCode: 2,
    diagnosisExperience: "first_time",
    ...body,
  };
}

export const respondentApi = {
  organization: (organizationId: string, init: { query?: string; cookieHeader?: string } = {}) =>
    callRoute(getOrganizationRoute, {
      method: "GET",
      url: `/api/v1/respondent/organizations/${organizationId}${init.query ?? ""}`,
      params: { organizationId },
      ...(init.cookieHeader ? { cookieHeader: init.cookieHeader } : {}),
    }),
  register: (body: unknown, headers: Record<string, string> = {}) =>
    callRoute(postSessionsRoute, {
      method: "POST",
      url: "/api/v1/respondent/sessions",
      body,
      headers,
    }),
  progress: (sessionId: string, cookieHeader?: string) =>
    callRoute(getSessionRoute, {
      method: "GET",
      url: `/api/v1/respondent/sessions/${sessionId}`,
      params: { sessionId },
      ...(cookieHeader ? { cookieHeader } : {}),
    }),
  start: (sessionId: string, cookieHeader?: string) =>
    callRoute(postStartRoute, {
      method: "POST",
      url: `/api/v1/respondent/sessions/${sessionId}/start`,
      params: { sessionId },
      ...(cookieHeader ? { cookieHeader } : {}),
    }),
  saveAnswers: (sessionId: string, cookieHeader: string | undefined, body: unknown) =>
    callRoute(putAnswersRoute, {
      method: "PUT",
      url: `/api/v1/respondent/sessions/${sessionId}/answers`,
      params: { sessionId },
      body,
      ...(cookieHeader ? { cookieHeader } : {}),
    }),
  submit: (sessionId: string, cookieHeader?: string) =>
    callRoute(postSubmitRoute, {
      method: "POST",
      url: `/api/v1/respondent/sessions/${sessionId}/submit`,
      params: { sessionId },
      ...(cookieHeader ? { cookieHeader } : {}),
    }),
};

export interface RegisteredViaApi {
  readonly sessionId: string;
  readonly cookieHeader: string;
  readonly dto: SessionCreatedDto;
}

/** 登録（201 を確認）。cookieHeader は "tk_session=<token>" */
export async function registerViaApi(body: RegistrationBody): Promise<RegisteredViaApi> {
  const res = await respondentApi.register(registrationBody(body));
  if (res.status !== 201) throw new Error(`POST /sessions が ${res.status} を返しました`);
  const cookieHeader = cookieHeaderFrom(res, RESPONDENT_COOKIE_NAME);
  if (!cookieHeader) throw new Error("tk_session が発行されませんでした");
  const dto = (await res.json()) as SessionCreatedDto;
  return { sessionId: dto.sessionId, cookieHeader, dto };
}

/** answers に含まれる設問をページ単位で保存する（20 回の PUT。含まれないページは飛ばす） */
export async function saveAllPagesViaApi(
  sessionId: string,
  cookieHeader: string,
  answers: Readonly<Record<number, number>>,
): Promise<void> {
  for (let pageNo = 1; pageNo <= 20; pageNo += 1) {
    const page = getExamPage(pageNo)
      .questions.filter((q) => answers[q.questionNo] !== undefined)
      .map((q) => ({ questionNo: q.questionNo, choiceCode: answers[q.questionNo] }));
    if (page.length === 0) continue;
    const res = await respondentApi.saveAnswers(sessionId, cookieHeader, {
      pageNo,
      answers: page,
    });
    if (res.status !== 200)
      throw new Error(`PUT answers（${pageNo}）が ${res.status} を返しました`);
  }
}

/** 登録 → 開始 → 20 ページ保存 → 送信（API 経由）。sessionId と Cookie を返す */
export async function completeViaApi(
  organizationId: string,
  answers: AnswerMap,
  options: { readonly kind?: RespondentKind; readonly name?: string } = {},
): Promise<RegisteredViaApi> {
  const registered = await registerViaApi({
    organizationId,
    ...(options.kind ? { kind: options.kind } : {}),
    ...(options.name ? { name: options.name } : {}),
  });
  const started = await respondentApi.start(registered.sessionId, registered.cookieHeader);
  if (started.status !== 200) throw new Error(`POST start が ${started.status} を返しました`);
  await saveAllPagesViaApi(registered.sessionId, registered.cookieHeader, answers);
  const submitted = await respondentApi.submit(registered.sessionId, registered.cookieHeader);
  if (submitted.status !== 200) throw new Error(`POST submit が ${submitted.status} を返しました`);
  return registered;
}

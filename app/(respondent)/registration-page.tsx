// R-01 受験者登録の共通の処理（11-1 §2.2.1）。/（page.tsx）と /exam（exam/page.tsx）が呼ぶ（ルートにならないファイル）。
// 画面を開いた時点では組織を確かめない（q が無い・形が違う・存在しない組織でもフォームを出し、「診断に進む」で確かめる）
import { redirect } from "next/navigation";
import type { ReactElement } from "react";

import { RegistrationForm } from "@/components/respondent/RegistrationForm";
import { stripAmpFromSearchParams } from "@/lib/presentation/exam-url";
import {
  kindFromLinkParam,
  previousResultIdFromParam,
} from "@/lib/presentation/registration-rules";
import { docIdSchema } from "@/lib/services/schemas/common";

export type RegistrationSearchParams = Promise<Record<string, string | string[] | undefined>>;

/** 同じ名前のパラメータが複数あるとき（?q=a&q=b）は、その値を使わない（無いものとして扱う） */
const single = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? undefined : v;

/**
 * URL のクエリに「amp;」があれば、取り除いた URL（同じパス）へリダイレクトする。
 * q は文書 ID の形のときだけ組織 ID として渡し（存在は確かめない）、p は executives のときだけ既存スタッフ。
 * 再受験リンクの prev は文書 ID の形のときだけ前回の結果の ID として渡し、画面には出さない（見出しは p だけで決まる。11-1 §2.2.8）
 */
export async function renderRegistrationPage(
  path: "/" | "/exam",
  searchParams: RegistrationSearchParams,
): Promise<ReactElement> {
  const params = await searchParams;
  const stripped = stripAmpFromSearchParams(params);
  if (stripped !== null) redirect(stripped === "" ? path : `${path}?${stripped}`);
  const q = single(params.q);
  const organizationId = q !== undefined && docIdSchema.safeParse(q).success ? q : null;
  return (
    <RegistrationForm
      organizationId={organizationId}
      kind={kindFromLinkParam(single(params.p))}
      previousResultId={previousResultIdFromParam(single(params.prev)) ?? null}
    />
  );
}

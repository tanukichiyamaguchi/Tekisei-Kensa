// 422 VALIDATION_ERROR の details.issues（04 §2.4）を欄ごとの文言にする。純関数
export function fieldErrorsFrom(
  details: Readonly<Record<string, unknown>>,
): Readonly<Record<string, string>> {
  const issues = Array.isArray(details.issues) ? details.issues : [];
  const out: Record<string, string> = {};
  for (const issue of issues) {
    if (typeof issue !== "object" || issue === null) continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (typeof path !== "string" || typeof message !== "string") continue;
    const field = path.split(/[.[]/)[0] ?? "";
    out[field] ??= message;
  }
  return out;
}

/** パスワードの長さ（M-03・M-07 と同じ 8〜72 文字。06 §3.3・§3.7）と英字・数字（01 D01-10） */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "パスワードは 8 文字以上で入力してください";
  if (password.length > 72) return "パスワードは 72 文字以内で入力してください";
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return "パスワードには英字と数字を含めてください";
  }
  return null;
}

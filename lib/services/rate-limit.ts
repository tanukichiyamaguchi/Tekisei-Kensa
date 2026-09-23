// アプリ側のレート制限（04 §2.8）。件数は Firestore の count() 集計で数える
import { API_ERRORS, ApiError } from "./errors";
import { countAiAnalysesSince } from "@/lib/db/repositories/ai-analyses-repository";
import { countRecentAuditLogs } from "@/lib/db/repositories/audit-logs-repository";

/** 受検者登録: 組織 × IP で 10 分 20 件（01 の仮置き） */
export const REGISTRATION_LIMIT = { count: 20, windowMs: 10 * 60 * 1000 } as const;
/** AI 解説生成: 組織で 1 日（Asia/Tokyo）200 件（01 の仮置き。10 K-03） */
export const AI_DAILY_LIMIT = 200;

/** ipAddress が null のときは制限しない（Firewall に委ねる） */
export async function assertRegistrationAllowed(input: {
  readonly organizationId: string;
  readonly ipAddress: string | null;
  readonly now: Date;
}): Promise<void> {
  if (input.ipAddress === null) return;
  const count = await countRecentAuditLogs({
    organizationId: input.organizationId,
    action: "respondent.register",
    ipAddress: input.ipAddress,
    since: new Date(input.now.getTime() - REGISTRATION_LIMIT.windowMs),
  });
  if (count >= REGISTRATION_LIMIT.count) throw API_ERRORS.rateLimited(600);
}

/** Asia/Tokyo の当日 0 時（UTC の Date）。日本は夏時間が無いため +9 時間固定 */
export function startOfTokyoDay(now: Date): Date {
  const offsetMs = 9 * 60 * 60 * 1000;
  const tokyo = new Date(now.getTime() + offsetMs);
  return new Date(
    Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate()) - offsetMs,
  );
}

export async function assertAiDailyLimit(input: {
  readonly organizationId: string;
  readonly now: Date;
}): Promise<void> {
  const count = await countAiAnalysesSince({
    organizationId: input.organizationId,
    since: startOfTokyoDay(input.now),
  });
  if (count >= AI_DAILY_LIMIT) {
    throw new ApiError(
      429,
      "AI_DAILY_LIMIT_EXCEEDED",
      "本日の AI 解説の生成回数の上限に達しました",
    );
  }
}

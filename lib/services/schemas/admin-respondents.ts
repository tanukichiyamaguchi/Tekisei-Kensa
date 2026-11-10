// 受検者の更新（04 §5.6、11-2 §3.6）。チーム・除外・区分と日付・役職のどれか 1 つ以上を受け付ける
import { z } from "zod";

import { calendarDateSchema, teamCodeSchema } from "./common";
import { EMPLOYMENT_STATUSES, STAFF_ROLES } from "@/lib/db/types";

/** 区分・入社日・退職日の 3 つ組。退職日は区分が退職のときだけ入れられる（退職日 < 入社日 は service が 422 LEFT_BEFORE_HIRED） */
export const employmentInputSchema = z
  .object({
    status: z.enum(EMPLOYMENT_STATUSES),
    hiredOn: calendarDateSchema.nullable(),
    leftOn: calendarDateSchema.nullable(),
  })
  .refine((v) => v.leftOn === null || v.status === "left", {
    message: "退職日は区分が退職のときだけ入れられます",
    path: ["leftOn"],
  });

export const updatePersonInputSchema = z
  .object({
    teamCode: teamCodeSchema.nullable().optional(), // null はチーム未設定に戻す（K-32 ⑦）
    isExcluded: z.boolean().optional(),
    employment: employmentInputSchema.optional(),
    staffRole: z.enum(STAFF_ROLES).optional(),
  })
  .refine(
    (v) =>
      v.teamCode !== undefined ||
      v.isExcluded !== undefined ||
      v.employment !== undefined ||
      v.staffRole !== undefined,
    { message: "変更する項目がありません" },
  );
export type UpdatePersonInput = z.infer<typeof updatePersonInputSchema>;

// 受検者のチーム・除外の更新（04 §5.6）
import { z } from "zod";

import { teamCodeSchema } from "./common";

export const updateRespondentInputSchema = z
  .object({
    teamCode: teamCodeSchema.nullable().optional(),
    isExcluded: z.boolean().optional(),
  })
  .refine((v) => v.teamCode !== undefined || v.isExcluded !== undefined, {
    message: "変更する項目がありません",
  });
export type UpdateRespondentInput = z.infer<typeof updateRespondentInputSchema>;

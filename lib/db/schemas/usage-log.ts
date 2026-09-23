import { z } from "zod";

import { docIdSchema, storedText, timestampSchema } from "./values";
import { DIAGNOSIS_EXPERIENCES, RESPONDENT_KINDS } from "@/lib/db/types";

/** usageLogs の作成データ（02 §3.7）。送信時に resultId / submittedAt を設定する */
export const usageLogCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  respondentId: docIdSchema,
  resultId: z.null(),
  respondentKind: z.enum(RESPONDENT_KINDS),
  name: storedText(1, 100),
  phoneNumber: storedText(1, 30),
  diagnosisExperience: z.enum(DIAGNOSIS_EXPERIENCES),
  registeredAt: timestampSchema,
  submittedAt: z.null(),
});

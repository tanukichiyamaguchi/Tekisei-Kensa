import { z } from "zod";

import { docIdSchema, storedText, timestampSchema } from "./values";
import { DIAGNOSIS_EXPERIENCES, RESPONDENT_KINDS } from "@/lib/db/types";

/**
 * usageLogs の作成データ（02 §3.7、11-1 §3.2.4）。送信のときに作り、resultId・submittedAt を必ず書く
 * （registeredAt は respondents.createdAt を写す）。M7 より前に登録のときに作った文書は resultId・submittedAt が null のまま残る
 */
export const usageLogCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  respondentId: docIdSchema,
  resultId: docIdSchema,
  respondentKind: z.enum(RESPONDENT_KINDS),
  name: storedText(1, 100),
  phoneNumber: storedText(1, 30),
  diagnosisExperience: z.enum(DIAGNOSIS_EXPERIENCES),
  registeredAt: timestampSchema,
  submittedAt: timestampSchema,
});

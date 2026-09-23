import { z } from "zod";

import { docIdSchema, storedOccupationCodeSchema, storedText } from "./values";
import { DIAGNOSIS_EXPERIENCES, RESPONDENT_KINDS } from "@/lib/db/types";

/** respondents の作成データ（02 §3.3）。登録時は teamCode = null、isExcluded = false、resultId = null */
export const respondentCreateSchema = z.strictObject({
  organizationId: docIdSchema,
  kind: z.enum(RESPONDENT_KINDS),
  name: storedText(1, 100),
  phoneNumber: storedText(1, 30),
  occupationCode: storedOccupationCodeSchema,
  diagnosisExperience: z.enum(DIAGNOSIS_EXPERIENCES),
  teamCode: z.null(),
  isExcluded: z.literal(false),
  sessionId: docIdSchema,
  usageLogId: docIdSchema,
  resultId: z.null(),
  deletedAt: z.null(),
});

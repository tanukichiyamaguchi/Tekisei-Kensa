import type { z } from "zod";

import { RepositoryError } from "@/lib/db/errors";

/** 書き込み前の検証（02 §2）。失敗は RepositoryError("VALIDATION_ERROR")。入力値は details に含めない */
export function validateForWrite<T extends z.ZodType>(
  schema: T,
  data: unknown,
  where: string,
): z.infer<T> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new RepositoryError("VALIDATION_ERROR", `${where} の保存データが不正です`, {
      paths: parsed.error.issues.map((i) => i.path.join(".") || "(root)"),
    });
  }
  return parsed.data;
}

// ブラウザ側の受検者 API の呼び出し口（05 §7.1）と sessionStorage の退避（05 §6.4）
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAllExamDrafts,
  clearExamDraft,
  examDraftKey,
  readExamDraft,
  setExamFlash,
  takeExamFlash,
  writeExamDraft,
} from "@/lib/utils/exam-draft-storage";
import {
  createSession,
  RespondentApiError,
  saveAnswers,
  startSession,
  submitSession,
  toAnswerMap,
} from "@/lib/utils/respondent-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function rejection(promise: Promise<unknown>): Promise<RespondentApiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RespondentApiError);
  return error as RespondentApiError;
}

describe("respondent-api", () => {
  it("PUT answers は JSON 本文・same-origin・no-store で送り、応答をそのまま返す", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { sessionId: "S1", answeredCount: 7 }));
    const dto = await saveAnswers(
      "S1",
      { pageNo: 1, answers: [{ questionNo: 1, choiceCode: 3 }] },
      { fetchImpl },
    );
    expect(dto).toEqual({ sessionId: "S1", answeredCount: 7 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/respondent/sessions/S1/answers");
    expect(init).toMatchObject({ method: "PUT", credentials: "same-origin", cache: "no-store" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      pageNo: 1,
      answers: [{ questionNo: 1, choiceCode: 3 }],
    });
  });

  it("start・submit は本文なし・Content-Type なし", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    await startSession("S1", { fetchImpl });
    await submitSession("S1", { fetchImpl });
    const calls = fetchImpl.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.map(([url]) => url)).toEqual([
      "/api/v1/respondent/sessions/S1/start",
      "/api/v1/respondent/sessions/S1/submit",
    ]);
    for (const [, init] of calls) {
      expect(init.method).toBe("POST");
      expect(init.body).toBeUndefined();
      expect(init.headers).toBeUndefined();
    }
  });

  it("非 2xx は { error: { code, details } } を RespondentApiError にする。JSON でない本文は INTERNAL_ERROR", async () => {
    const error = await rejection(
      submitSession("S1", {
        fetchImpl: async () =>
          jsonResponse(422, {
            error: { code: "ANSWERS_INCOMPLETE", message: "未回答", details: { missing: [3] } },
          }),
      }),
    );
    expect(error).toMatchObject({
      status: 422,
      code: "ANSWERS_INCOMPLETE",
      details: { missing: [3] },
    });
    const gateway = await rejection(
      startSession("S1", { fetchImpl: async () => new Response("Bad Gateway", { status: 502 }) }),
    );
    expect(gateway).toMatchObject({ status: 502, code: "INTERNAL_ERROR", details: {} });
  });

  it("通信断は NETWORK_ERROR、30 秒（ここでは短縮）で TIMEOUT、オフラインは送らずに OFFLINE", async () => {
    const network = await rejection(
      startSession("S1", {
        fetchImpl: async () => {
          throw new TypeError("Failed to fetch");
        },
      }),
    );
    expect(network.code).toBe("NETWORK_ERROR");

    const timeout = await rejection(
      startSession("S1", {
        timeoutMs: 10,
        fetchImpl: (_url, init) =>
          new Promise((_, reject) => {
            init.signal?.addEventListener("abort", () => reject(new DOMException("aborted")));
          }),
      }),
    );
    expect(timeout.code).toBe("TIMEOUT");

    vi.stubGlobal("navigator", { onLine: false });
    const fetchImpl = vi.fn();
    const offline = await rejection(
      createSession(
        {
          organizationId: "O",
          kind: "applicant",
          name: "a",
          phoneNumber: "09000000000",
          occupationCode: 1,
          diagnosisExperience: "first_time",
        },
        { fetchImpl },
      ),
    );
    expect(offline.code).toBe("OFFLINE");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("toAnswerMap は配列を Map にする", () => {
    expect(
      toAnswerMap([
        { questionNo: 1, choiceCode: 2 },
        { questionNo: 3, choiceCode: 4 },
      ]),
    ).toEqual(
      new Map([
        [1, 2],
        [3, 4],
      ]),
    );
  });
});

class MemoryStorage {
  private readonly map = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (this.failWrites) throw new DOMException("QuotaExceededError");
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("exam-draft-storage（05 §6.4）", () => {
  it("キーは tk_exam_draft:{sessionId}:{pageNo}、値は questionNo → choiceCode の JSON", () => {
    const storage = new MemoryStorage();
    writeExamDraft(
      "S1",
      8,
      new Map([
        [51, 3],
        [52, 1],
      ]),
      storage,
    );
    expect(examDraftKey("S1", 8)).toBe("tk_exam_draft:S1:8");
    expect(storage.getItem("tk_exam_draft:S1:8")).toBe('{"51":3,"52":1}');
    expect(readExamDraft("S1", 8, storage)).toEqual(
      new Map([
        [51, 3],
        [52, 1],
      ]),
    );
    clearExamDraft("S1", 8, storage);
    expect(readExamDraft("S1", 8, storage).size).toBe(0);
  });

  it("壊れた値・不正な項目は捨て、ストレージが使えなくても例外を投げない", () => {
    const storage = new MemoryStorage();
    storage.setItem(examDraftKey("S1", 1), "{not json");
    expect(readExamDraft("S1", 1, storage).size).toBe(0);
    storage.setItem(examDraftKey("S1", 2), '{"1":2,"x":3,"4":"5","5":1.5}');
    expect(readExamDraft("S1", 2, storage)).toEqual(new Map([[1, 2]]));
    storage.failWrites = true;
    expect(() => writeExamDraft("S1", 3, new Map([[1, 1]]), storage)).not.toThrow();
    expect(() => readExamDraft("S1", 3, null)).not.toThrow();
    expect(() => clearAllExamDrafts(undefined, null)).not.toThrow();
  });

  it("clearAllExamDrafts は指定セッション（省略時は全セッション）の退避だけを消す", () => {
    const storage = new MemoryStorage();
    writeExamDraft("S1", 1, new Map([[1, 1]]), storage);
    writeExamDraft("S1", 2, new Map([[8, 1]]), storage);
    writeExamDraft("S2", 1, new Map([[1, 2]]), storage);
    storage.setItem("other", "keep");
    clearAllExamDrafts("S1", storage);
    expect(readExamDraft("S1", 1, storage).size).toBe(0);
    expect(readExamDraft("S1", 2, storage).size).toBe(0);
    expect(readExamDraft("S2", 1, storage).size).toBe(1);
    clearAllExamDrafts(undefined, storage);
    expect(readExamDraft("S2", 1, storage).size).toBe(0);
    expect(storage.getItem("other")).toBe("keep");
  });

  it("フラグは読んだら消える", () => {
    const storage = new MemoryStorage();
    setExamFlash("S1", "E-02", storage);
    expect(takeExamFlash("S1", storage)).toBe("E-02");
    expect(takeExamFlash("S1", storage)).toBeNull();
  });
});

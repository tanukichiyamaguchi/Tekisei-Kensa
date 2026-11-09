// ブラウザ側の受検者 API の呼び出し口（05 §7.1、11-1 §3.4.2）と sessionStorage の退避（M7-exam-15。11-1 §2.4.5）
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearAllExamDrafts,
  clearExamDraft,
  examDraftKey,
  loadExamDrafts,
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
      { stepNo: 1, answers: [{ questionNo: 1, choiceCode: 3 }] },
      { fetchImpl },
    );
    expect(dto).toEqual({ sessionId: "S1", answeredCount: 7 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/v1/respondent/sessions/S1/answers");
    expect(init).toMatchObject({ method: "PUT", credentials: "same-origin", cache: "no-store" });
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({
      stepNo: 1,
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
          phoneNumber: "00000000000",
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

describe("M7-exam-15 exam-draft-storage（11-1 §2.4.5）", () => {
  it("キーは tk_exam_step:{sessionId}:{stepNo}、値は設問番号 → 選択の JSON（空なら消す）", () => {
    const storage = new MemoryStorage();
    writeExamDraft(
      "S1",
      2,
      new Map([
        [42, 3],
        [43, 1],
      ]),
      storage,
    );
    expect(examDraftKey("S1", 2)).toBe("tk_exam_step:S1:2");
    expect(storage.getItem("tk_exam_step:S1:2")).toBe('{"42":3,"43":1}');
    expect(loadExamDrafts("S1", storage)).toEqual(
      new Map([
        [42, 3],
        [43, 1],
      ]),
    );
    writeExamDraft("S1", 2, new Map(), storage);
    expect(storage.getItem("tk_exam_step:S1:2")).toBeNull();
    writeExamDraft("S1", 3, new Map([[90, 2]]), storage);
    clearExamDraft("S1", 3, storage);
    expect(storage.length).toBe(0);
  });

  it("全ステップの退避を読み、設問番号 1〜144・値 1〜5 でないものと壊れた値は捨てる", () => {
    const storage = new MemoryStorage();
    storage.setItem("tk_exam_step:S1:1", '{"1":2,"x":3,"4":"5","5":1.5,"6":6,"7":0}');
    storage.setItem("tk_exam_step:S1:4", '{"144":5,"145":1}');
    storage.setItem("tk_exam_step:S1:3", "{not json");
    storage.setItem("tk_exam_step:S1:2", "[1,2]");
    expect(loadExamDrafts("S1", storage)).toEqual(
      new Map([
        [1, 2],
        [144, 5],
      ]),
    );
  });

  it("旧キー tk_exam_draft:{sessionId}:{pageNo} のこのセッションの値は取り込んでから消し、ほかのセッションの値は取り込まない", () => {
    const storage = new MemoryStorage();
    storage.setItem("tk_exam_draft:S1:8", '{"51":3,"52":1,"145":2,"53":6}');
    storage.setItem("tk_exam_draft:S1:1", '{"1":4}');
    storage.setItem("tk_exam_draft:S2:1", '{"2":5}');
    storage.setItem("tk_exam_step:S1:2", '{"52":4,"60":2}');
    const loaded = loadExamDrafts("S1", storage);
    // 同じ設問は新しいキーの値を優先する
    expect(loaded).toEqual(
      new Map([
        [51, 3],
        [52, 4],
        [1, 4],
        [60, 2],
      ]),
    );
    expect(storage.getItem("tk_exam_draft:S1:8")).toBeNull();
    expect(storage.getItem("tk_exam_draft:S1:1")).toBeNull();
    // 取り込んだ値は新しいキー（ステップごと）に書き直す
    expect(JSON.parse(storage.getItem("tk_exam_step:S1:1") ?? "{}")).toEqual({ "1": 4 });
    expect(JSON.parse(storage.getItem("tk_exam_step:S1:2") ?? "{}")).toEqual({
      "51": 3,
      "52": 4,
      "60": 2,
    });
    // ほかのセッションの旧キーは触らない
    expect(storage.getItem("tk_exam_draft:S2:1")).toBe('{"2":5}');
    expect(loadExamDrafts("S1", storage)).toEqual(loaded);
  });

  it("「戻る」用の tk_exam_flash: は読み込みのときに消す", () => {
    const storage = new MemoryStorage();
    storage.setItem("tk_exam_flash:S1", '{"text":"E-02","pageNo":3}');
    storage.setItem("tk_exam_flash:S2", '{"text":"E-02","pageNo":1}');
    expect(loadExamDrafts("S1", storage).size).toBe(0);
    expect(storage.getItem("tk_exam_flash:S1")).toBeNull();
    expect(storage.getItem("tk_exam_flash:S2")).not.toBeNull();
  });

  it("clearAllExamDrafts は新しいキー・旧キー・tk_exam_flash: を、指定セッション（省略時は全セッション）の分だけ消す", () => {
    const storage = new MemoryStorage();
    writeExamDraft("S1", 1, new Map([[1, 1]]), storage);
    writeExamDraft("S1", 2, new Map([[42, 1]]), storage);
    writeExamDraft("S2", 1, new Map([[1, 2]]), storage);
    storage.setItem("tk_exam_draft:S1:3", '{"15":1}');
    storage.setItem("tk_exam_draft:S2:3", '{"15":1}');
    storage.setItem("tk_exam_flash:S1", "x");
    storage.setItem("other", "keep");
    clearAllExamDrafts("S1", storage);
    expect([...Array(storage.length).keys()].map((i) => storage.key(i)).sort()).toEqual([
      "other",
      "tk_exam_draft:S2:3",
      "tk_exam_step:S2:1",
    ]);
    clearAllExamDrafts(undefined, storage);
    expect([...Array(storage.length).keys()].map((i) => storage.key(i))).toEqual(["other"]);
  });

  it("sessionStorage が使えなくても例外を投げない", () => {
    const storage = new MemoryStorage();
    storage.failWrites = true;
    expect(() => writeExamDraft("S1", 3, new Map([[90, 1]]), storage)).not.toThrow();
    const throwing = {
      get length(): number {
        throw new DOMException("SecurityError");
      },
      key: () => {
        throw new DOMException("SecurityError");
      },
      getItem: () => {
        throw new DOMException("SecurityError");
      },
      setItem: () => {
        throw new DOMException("SecurityError");
      },
      removeItem: () => {
        throw new DOMException("SecurityError");
      },
    };
    expect(() => loadExamDrafts("S1", throwing)).not.toThrow();
    expect(loadExamDrafts("S1", throwing).size).toBe(0);
    expect(() => writeExamDraft("S1", 1, new Map([[1, 1]]), throwing)).not.toThrow();
    expect(() => clearExamDraft("S1", 1, throwing)).not.toThrow();
    expect(() => clearAllExamDrafts("S1", throwing)).not.toThrow();
    expect(() => loadExamDrafts("S1", null)).not.toThrow();
    expect(() => clearAllExamDrafts(undefined, null)).not.toThrow();
    // window の無い環境（サーバ・Vitest の node）では既定のストレージが null になる
    expect(loadExamDrafts("S1").size).toBe(0);
  });
});

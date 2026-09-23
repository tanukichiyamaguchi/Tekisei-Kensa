// I-37 fetchPopulation() のクエリ結果（08 §3.3、00 §1.11、02 §8.5）。09 §6.4 の 1（deletedAt == null）と 2（select の map 射影）
import { beforeAll, describe, expect, it } from "vitest";

import type { Viewer } from "@/lib/auth/claims";
import {
  softDeleteRespondent,
  updateRespondentFlags,
} from "@/lib/db/repositories/respondents-repository";
import { fetchPopulation } from "@/lib/db/repositories/results-repository";
import { scoreAnswers } from "@/lib/scoring/score";
import { COMPATIBILITY_KEYS, TRAIT_KEYS } from "@/lib/scoring/types";

import {
  createOrganizationWithOwner,
  createTestOrganization,
  cyclicAnswers,
  meta,
  submitAnswerSet,
  uniformAnswers,
  type TestOrganization,
} from "../helpers/fixtures";
import { writeDocForTest } from "../helpers/firestore";

let org: TestOrganization;
const ids: Record<string, string> = {};

beforeAll(async () => {
  const created = await createOrganizationWithOwner("母集団テスト歯科");
  org = created.org;
  const viewer: Viewer = {
    uid: created.owner.uid,
    organizationId: org.organizationId,
    role: "owner",
  };

  ids.a1 = (await submitAnswerSet(org, uniformAnswers(1))).resultId;
  ids.a2 = (await submitAnswerSet(org, cyclicAnswers())).resultId;

  const excluded = await submitAnswerSet(org, uniformAnswers(2));
  await updateRespondentFlags({
    respondentId: excluded.respondentId,
    viewer,
    patch: { isExcluded: true },
    meta,
  });
  ids.b = excluded.resultId;

  const deleted = await submitAnswerSet(org, uniformAnswers(3));
  await softDeleteRespondent({ respondentId: deleted.respondentId, viewer, meta });
  ids.c = deleted.resultId;

  // 例外的な直接書き込み: 採点方式の版が古い結果（I-27 と同じ）
  ids.d = (await submitAnswerSet(org, uniformAnswers(4))).resultId;
  await writeDocForTest("results", ids.d, { scoringVersion: "0.9.0" });

  const team = await submitAnswerSet(org, uniformAnswers(5));
  await updateRespondentFlags({
    respondentId: team.respondentId,
    viewer,
    patch: { teamCode: "A" },
    meta,
  });
  ids.e = team.resultId;

  ids.f = (await submitAnswerSet(org, uniformAnswers(3), { kind: "executive" })).resultId;

  const other: TestOrganization = await createTestOrganization("別組織歯科");
  ids.other = (await submitAnswerSet(other, uniformAnswers(1))).resultId;
});

describe("I-37 fetchPopulation", () => {
  it("組織全体: (a)(e)(f) の 4 件（除外・論理削除・旧版・別組織を含まない）", async () => {
    const rows = await fetchPopulation({
      organizationId: org.organizationId,
      scope: { kind: "organization" },
    });
    expect(rows.map((r) => r.resultId).sort()).toEqual([ids.a1, ids.a2, ids.e, ids.f].sort());
  });

  it("チーム A: (e) の 1 件", async () => {
    const rows = await fetchPopulation({
      organizationId: org.organizationId,
      scope: { kind: "team", teamCode: "A" },
    });
    expect(rows.map((r) => r.resultId)).toEqual([ids.e]);
    const empty = await fetchPopulation({
      organizationId: org.organizationId,
      scope: { kind: "team", teamCode: "B" },
    });
    expect(empty).toEqual([]);
  });

  it("select() の射影で traits・compatibility の map 全体が返り、個人情報を含まない", async () => {
    const rows = await fetchPopulation({
      organizationId: org.organizationId,
      scope: { kind: "organization" },
    });
    const row = rows.find((r) => r.resultId === ids.a2)!;
    const expected = scoreAnswers(cyclicAnswers());
    expect(row.traits).toStrictEqual(expected.traits);
    expect(row.compatibility).toStrictEqual(expected.compatibility);
    expect(Object.keys(row.traits)).toHaveLength(TRAIT_KEYS.length);
    expect(Object.keys(row.compatibility)).toHaveLength(COMPATIBILITY_KEYS.length);
    for (const r of rows)
      expect(Object.keys(r).sort()).toEqual(["compatibility", "resultId", "traits"]);
  });
});

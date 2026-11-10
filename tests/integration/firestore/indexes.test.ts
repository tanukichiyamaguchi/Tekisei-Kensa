// I-50 複合インデックスの過不足（08 §3.3、02 §7、09 §6.4 の 3）と、M7 のインデックス（M7-exam-34・M7-list-33・
// M7-misc-25・M7-compare-24。11-1 §3.2.5、11-2 §3.4、11-8 §3.4、11-5 §3.1）。
// Firestore Emulator は未定義の複合インデックスを必要とするクエリでも失敗せず、ログにも警告を出さないことを確認した
// （firestore-debug.log に該当出力なし）。そのため 08 の代替手順どおり、リポジトリ関数が実際に発行したクエリの形
// （等価条件・不等号条件・並び順）を捕捉し、firestore.indexes.json の定義と機械的に照合する。
// Q-M7-1 はリポジトリの canLinkAsPrevious() の発行で照合する（M7-exam-34。送信のトランザクションの中の同じ形のクエリは
// tx.get() で読み、Query.prototype.get を通らないので捕捉されない）。Q5（改）・Q6（改）は利用履歴の listUsageLogs({ viewer })
// の発行で照合する（M7-list-33。11-2 §3.4）
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { Query } from "firebase-admin/firestore";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Viewer } from "@/lib/auth/claims";
import { hashInviteToken } from "@/lib/auth/invite-token";
import { getSessionByTokenHash } from "@/lib/db/repositories/assessment-sessions-repository";
import { listActiveOwners, listAdminUsers } from "@/lib/db/repositories/admin-users-repository";
import { countAiAnalysesSince } from "@/lib/db/repositories/ai-analyses-repository";
import { countRecentAuditLogs } from "@/lib/db/repositories/audit-logs-repository";
import { findOrganizationByInviteTokenHash } from "@/lib/db/repositories/organizations-repository";
import {
  canLinkAsPrevious,
  fetchPopulation,
  listResults,
} from "@/lib/db/repositories/results-repository";
import { listUsageLogs } from "@/lib/db/repositories/usage-logs-repository";
import { adminFirestore } from "@/lib/firebase/admin";

import { createOrganizationWithOwner, submitAnswerSet, uniformAnswers } from "../helpers/fixtures";

interface IndexField {
  readonly fieldPath: string;
  readonly order: "ASCENDING" | "DESCENDING";
}
interface IndexDef {
  readonly collectionGroup: string;
  readonly queryScope: string;
  readonly fields: readonly IndexField[];
}
interface IndexFile {
  readonly indexes: readonly IndexDef[];
  readonly fieldOverrides: ReadonlyArray<{
    collectionGroup: string;
    fieldPath: string;
    indexes: readonly unknown[];
  }>;
}
const indexFile = JSON.parse(readFileSync("firebase/firestore.indexes.json", "utf8")) as IndexFile;

const indexKey = (index: IndexDef) =>
  `${index.collectionGroup}(${index.fields.map((f) => `${f.fieldPath} ${f.order}`).join(", ")})`;

/**
 * M7 で使わなくなり、PR-7.17 で消す定義（firestore.indexes.json の順）。11-5 §3.1・§3.11: 2.5 版までの Q1・Q2
 * （fetchPopulation() は Q1（改）で読む）。11-2 §3.4: registeredAt 順の Q5・Q6 の 4 本（利用履歴は Q5（改）・Q6（改）で読む）。
 * 使うコードのデプロイの後に消す規則（08 §8.2 の 4）と、前の版に戻すときのため、M7 の最後まで定義に残す
 */
const RETIRED_INDEXES = [
  "results(organizationId ASCENDING, isExcluded ASCENDING, scoringVersion ASCENDING, deletedAt ASCENDING)",
  "results(organizationId ASCENDING, isExcluded ASCENDING, scoringVersion ASCENDING, deletedAt ASCENDING, teamCode ASCENDING)",
  "usageLogs(organizationId ASCENDING, registeredAt DESCENDING)",
  "usageLogs(organizationId ASCENDING, registeredAt ASCENDING)",
  "usageLogs(organizationId ASCENDING, respondentKind ASCENDING, registeredAt DESCENDING)",
  "usageLogs(organizationId ASCENDING, respondentKind ASCENDING, registeredAt ASCENDING)",
];

/** 捕捉したクエリの形 */
interface QueryShape {
  readonly collection: string;
  readonly equalities: readonly string[];
  readonly inequalities: readonly string[];
  readonly orders: readonly IndexField[];
}

interface ProtoFilter {
  compositeFilter?: { filters: ProtoFilter[] };
  fieldFilter?: { field: { fieldPath: string }; op: string };
  unaryFilter?: { field: { fieldPath: string }; op: string };
}
interface StructuredQuery {
  from: Array<{ collectionId?: string }>;
  where?: ProtoFilter;
  orderBy?: Array<{ field: { fieldPath: string }; direction?: string }>;
}
type WithStructuredQuery = { toStructuredQuery(): StructuredQuery };

const EQUALITY_OPS = new Set(["EQUAL", "IS_NULL", "IS_NAN"]);

function flatten(filter: ProtoFilter | undefined): Array<{ field: string; op: string }> {
  if (!filter) return [];
  if (filter.compositeFilter) return filter.compositeFilter.filters.flatMap(flatten);
  const f = filter.fieldFilter ?? filter.unaryFilter;
  if (!f) throw new Error(`未対応のフィルタ: ${JSON.stringify(filter)}`);
  return [{ field: f.field.fieldPath, op: f.op }];
}

function toShape(sq: StructuredQuery): QueryShape {
  const filters = flatten(sq.where);
  return {
    collection: sq.from[0]?.collectionId ?? "",
    equalities: [
      ...new Set(filters.filter((f) => EQUALITY_OPS.has(f.op)).map((f) => f.field)),
    ].sort(),
    inequalities: [
      ...new Set(filters.filter((f) => !EQUALITY_OPS.has(f.op)).map((f) => f.field)),
    ].sort(),
    orders: (sq.orderBy ?? []).map((o) => ({
      fieldPath: o.field.fieldPath,
      order: o.direction === "DESCENDING" ? "DESCENDING" : "ASCENDING",
    })),
  };
}

/** クエリに必要な並び（不等号のみで orderBy が無ければ不等号フィールドの昇順が暗黙に付く） */
function orderingOf(shape: QueryShape): readonly IndexField[] {
  if (shape.orders.length > 0) return shape.orders;
  return shape.inequalities.map((fieldPath) => ({ fieldPath, order: "ASCENDING" as const }));
}

/** 単一フィールドの既定インデックスで足りるか（対象フィールドが 1 つ以下） */
function needsComposite(shape: QueryShape): boolean {
  const fields = new Set([
    ...shape.equalities,
    ...shape.inequalities,
    ...shape.orders.map((o) => o.fieldPath),
  ]);
  return fields.size > 1;
}

/** 定義 index がクエリを処理できるか: 先頭が等価条件のフィールド集合、続きが並び（方向まで一致） */
function indexServes(index: IndexDef, shape: QueryShape): boolean {
  if (index.collectionGroup !== shape.collection || index.queryScope !== "COLLECTION") return false;
  const eq = shape.equalities;
  const head = index.fields
    .slice(0, eq.length)
    .map((f) => f.fieldPath)
    .sort();
  if (JSON.stringify(head) !== JSON.stringify(eq)) return false;
  const rest = index.fields.slice(eq.length);
  const ordering = orderingOf(shape);
  if (ordering.length === 0) return true; // 等価条件のみ: 先頭一致で足りる
  return JSON.stringify(rest) === JSON.stringify(ordering);
}

const captured: QueryShape[] = [];

beforeAll(async () => {
  const record = (q: WithStructuredQuery) => captured.push(toShape(q.toStructuredQuery()));
  const originalGet = Query.prototype.get;
  vi.spyOn(Query.prototype, "get").mockImplementation(function (this: Query) {
    record(this as unknown as WithStructuredQuery);
    return originalGet.call(this);
  });
  const aggregateProto = Object.getPrototypeOf(adminFirestore().collection("probe").count()) as {
    get: (...args: unknown[]) => Promise<unknown>;
  };
  const originalAggregateGet = aggregateProto.get;
  vi.spyOn(aggregateProto, "get").mockImplementation(function (
    this: { _query: WithStructuredQuery },
    ...args: unknown[]
  ) {
    record(this._query);
    return originalAggregateGet.apply(this, args);
  });

  // リポジトリの全クエリを発行する（02 §7.1 の Q1（改）・Q3・Q4・Q5（改）・Q6（改）・Q7〜Q12・Q14、Q-M7-1、Q-M7-2。
  // registeredAt 順の Q5・Q6 と Q13 は 2.7 版でやめた）
  const { org, owner } = await createOrganizationWithOwner("インデックス歯科");
  const submitted = await submitAnswerSet(org, uniformAnswers(3));
  const ownerViewer: Viewer = { uid: owner.uid, organizationId: org.organizationId, role: "owner" };
  const adminViewer: Viewer = { ...ownerViewer, role: "admin" };
  // Q1（改。11-5 §3.1）: 組織の論理削除されていない全件。チームを選んでも同じ形（M7-compare-24 の Q1（改）の分）
  await fetchPopulation({ organizationId: org.organizationId, scope: { kind: "organization" } });
  await fetchPopulation({
    organizationId: org.organizationId,
    scope: { kind: "team", teamCode: "A" },
  });
  // Q-M7-1（11-1 §3.2.5）: 前回の候補の判定。生きている結果なので、文書の読み取りのあとクエリまで進む
  expect(
    await canLinkAsPrevious({ organizationId: org.organizationId, resultId: submitted.resultId }),
  ).toBe(true);
  for (const viewer of [ownerViewer, adminViewer]) {
    await listResults({ viewer }); // Q3 / Q4（回答一覧・組織内分類。11-3 §3.1）
    await listUsageLogs({ viewer }); // Q5（改）/ Q6（改）（11-2 §3.4。M7-list-33）
  }
  await listAdminUsers(org.organizationId); // Q8
  await listActiveOwners(org.organizationId); // Q-M7-2（11-8 §3.4）
  await findOrganizationByInviteTokenHash(hashInviteToken(org.inviteToken)); // Q9
  await getSessionByTokenHash({
    organizationId: org.organizationId,
    sessionTokenHash: "0".repeat(64),
    now: new Date(),
  }); // Q10
  await countRecentAuditLogs({
    organizationId: org.organizationId,
    action: "respondent.register",
    ipAddress: "203.0.113.10",
    since: new Date(Date.now() - 600_000),
  }); // Q11
  await countAiAnalysesSince({
    organizationId: org.organizationId,
    since: new Date(Date.now() - 86_400_000),
  }); // Q14
  // 運用者の参照・テスト用として 02 §7.1 に定義されたクエリ（Q7、Q12）
  await adminFirestore()
    .collection("aiAnalyses")
    .where("resultId", "==", "x")
    .orderBy("createdAt", "desc")
    .get();
  await adminFirestore()
    .collection("auditLogs")
    .where("organizationId", "==", org.organizationId)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get();
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe("I-50 firestore.indexes.json とクエリの照合", () => {
  it("発行した全クエリが、単一フィールドの既定インデックスか定義済みの複合インデックスで処理できる", () => {
    const relevant = captured.filter((s) => s.collection !== "probe");
    // 捕捉できていることの確かめ。PR-7.7a で listResultsForClassification の 2 本（Q3 / Q4 と同じ形）を消して 15 本
    expect(relevant.length).toBeGreaterThanOrEqual(15);
    const missing = relevant
      .filter(needsComposite)
      .filter((shape) => !indexFile.indexes.some((index) => indexServes(index, shape)));
    expect(missing).toEqual([]);
  });

  it("使われていない定義は、M7 で使わなくなり PR-7.17 で消す 6 本（2.5 版までの Q1・Q2 と、registeredAt 順の Q5・Q6 の 4 本）だけ（ほかに使わない定義が無い）", () => {
    const unused = indexFile.indexes.filter(
      (index) => !captured.filter(needsComposite).some((shape) => indexServes(index, shape)),
    );
    expect(unused.map(indexKey)).toEqual(RETIRED_INDEXES);
  });

  it("M7 の 4 本（Q-M7-1・Q-M7-2・Q5／Q6 の改め）と除外 2 つが定義にあり、複合 18 本・除外 14 件（02 §7.3）", () => {
    expect(indexFile.indexes.map(indexKey)).toEqual(
      expect.arrayContaining([
        "results(organizationId ASCENDING, previousResultId ASCENDING, deletedAt ASCENDING)",
        "adminUsers(organizationId ASCENDING, role ASCENDING, deletedAt ASCENDING)",
        "usageLogs(organizationId ASCENDING, submittedAt DESCENDING)",
        "usageLogs(organizationId ASCENDING, respondentKind ASCENDING, submittedAt DESCENDING)",
      ]),
    );
    expect(indexFile.fieldOverrides).toEqual(
      expect.arrayContaining([
        { collectionGroup: "organizations", fieldPath: "inviteToken", indexes: [] },
        { collectionGroup: "adminUsers", fieldPath: "dismissedAnnouncements", indexes: [] },
      ]),
    );
    expect(indexFile.indexes).toHaveLength(18);
    expect(indexFile.fieldOverrides).toHaveLength(14);
  });

  it("単一フィールドインデックスを除外したフィールドを条件・並びに使っていない", () => {
    const exempt = new Set(
      indexFile.fieldOverrides
        .filter((o) => o.indexes.length === 0)
        .map((o) => `${o.collectionGroup}.${o.fieldPath}`),
    );
    const used = captured.flatMap((s) =>
      [...s.equalities, ...s.inequalities, ...s.orders.map((o) => o.fieldPath)].map(
        (f) => `${s.collection}.${f}`,
      ),
    );
    expect(
      used.filter((f) => exempt.has(f) || [...exempt].some((e) => f.startsWith(`${e}.`))),
    ).toEqual([]);
  });

  it("クエリを発行するファイルが本テストで網羅した一覧と一致する（新しいクエリを追加したら本テストに加える）", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".ts") && /\.(where|orderBy)\(/.test(readFileSync(path, "utf8")))
          files.push(path);
      }
    };
    walk("lib");
    expect(files.sort()).toEqual(
      [
        "lib/db/repositories/admin-users-repository.ts",
        "lib/db/repositories/ai-analyses-repository.ts",
        "lib/db/repositories/assessment-sessions-repository.ts",
        "lib/db/repositories/audit-logs-repository.ts",
        "lib/db/repositories/organizations-repository.ts",
        "lib/db/repositories/results-repository.ts",
        "lib/db/repositories/usage-logs-repository.ts",
      ].sort(),
    );
  });
});

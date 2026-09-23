// 付録A（設問文）・付録B（計算式・タイプ表）から lib/masters/data/*.json を生成する（03 §4.5、08 §7.3）。
//
//   pnpm masters:generate   生成して書き込む
//   pnpm masters:check      生成せずに、コミット済みの生成物と一致するかを検査する（08 §7.6。不一致は終了コード 1）
//
// 付録の書式や不変条件（03 §4.2）から外れた箇所が 1 つでもあれば、何も書き込まずに失敗する。
import { pathToFileURL } from "node:url";

import {
  QUESTION_PAGE_LAYOUT,
  SCORED_QUESTION_COUNT,
  stepAndPageOf,
} from "../lib/masters/question-layout";
import {
  APTITUDE_KEYS,
  APTITUDE_TYPE_KEYS,
  COMPATIBILITY_KEYS,
  RISK_KEYS,
  SCORE_ATTRIBUTE_KEYS,
  SOCIAL_STYLE_KEYS,
  TRAIT_KEYS,
} from "../lib/scoring/types";
import type { ChoiceCode, ScoreAttributeKey } from "../lib/scoring/types";
import { SCORING_VERSION } from "../lib/scoring/version";
import {
  codeBlock,
  fail,
  GenerationError,
  parseNumber,
  readSource,
  sectionByPrefix,
  sourceHashes,
  splitSections,
  tableRows,
  writeOrCheck,
} from "./lib/generator";
import { formatJson } from "./lib/json-format";
import {
  APTITUDE_LABELS,
  APTITUDE_TYPE_LABELS,
  ATTRIBUTE_LABELS,
  CHOICE_LABELS,
  COMPATIBILITY_LABELS,
  RISK_LABELS,
  SOCIAL_STYLE_LABELS,
  TRAIT_LABELS,
} from "./lib/labels";

/** 解析規則の版（08 §7.2）。規則を変えたら上げ、全生成物を再生成する */
const GENERATOR_VERSION = "1";

const SRC_A = "docs/付録A_設問一覧.md";
const SRC_B = "docs/付録B_採点ロジック仕様.md";
const SRC_LABELS = "scripts/lib/labels.ts";
const SRC_LAYOUT = "lib/masters/question-layout.ts";
const OUT_DIR = "lib/masters/data";

const TOTAL_QUESTION_COUNT = 204;

// ---------------------------------------------------------------------------
// 手順 1: 設問（付録A「## 設問（Q1〜Q204）」）

interface QuestionItem {
  questionNo: number;
  text: string;
  isActive: boolean;
  isScored: boolean;
  step: number | null;
  page: number | null;
}

function parseQuestions(appendixA: string): QuestionItem[] {
  const rows = tableRows(sectionByPrefix(splitSections(appendixA, "##"), "設問（Q1〜Q204）"));
  const [header, ...body] = rows;
  if (header?.join("|") !== "Q|設問文") fail(`付録A の設問表の見出しが想定外です: ${header}`);
  const items = body.map((cells, i): QuestionItem => {
    if (cells.length !== 2) fail(`付録A の設問表の列数が 2 ではありません: ${cells.join(" | ")}`);
    const questionNo = parseNumber(cells[0]!, "付録A 設問番号");
    const text = cells[1]!;
    if (questionNo !== i + 1) fail(`付録A の設問番号が連番ではありません: Q${questionNo}`);
    if (text === "") fail(`付録A の設問文が空です: Q${questionNo}`);
    const scored = questionNo <= SCORED_QUESTION_COUNT;
    const layout = scored ? stepAndPageOf(questionNo) : null;
    return {
      questionNo,
      text,
      isActive: scored,
      isScored: scored,
      step: layout?.step ?? null,
      page: layout?.page ?? null,
    };
  });
  if (items.length !== TOTAL_QUESTION_COUNT)
    fail(`付録A の設問数が ${items.length} 件です（204 件のはず）`);
  return items;
}

// ---------------------------------------------------------------------------
// 手順 2: 配点表（付録B §1）

type ChoiceItem = { choiceCode: ChoiceCode; label: string } & Record<ScoreAttributeKey, number>;

function parseChoiceScores(section: readonly string[]): ChoiceItem[] {
  const [header, ...body] = tableRows(section);
  if (!header || header[0] !== "選択肢") fail("付録B §1 の配点表が見つかりません");
  const columns = header
    .slice(1)
    .map((name) => ATTRIBUTE_LABELS[name] ?? fail(`未知の配点属性: ${name}`));
  if ([...columns].sort().join() !== [...SCORE_ATTRIBUTE_KEYS].sort().join()) {
    fail("付録B §1 の配点属性の列が 9 種と一致しません");
  }
  if (body.length !== CHOICE_LABELS.length) fail("付録B §1 の配点表が 5 行ではありません");
  return CHOICE_LABELS.map(({ code, label }, i) => {
    const cells = body[i]!;
    if (cells[0] !== label)
      fail(`付録B §1 の ${i + 1} 行目が「${label}」ではありません: ${cells[0]}`);
    if (cells.length !== columns.length + 1) fail(`付録B §1 の「${label}」の列数が不正です`);
    const values = Object.fromEntries(
      columns.map((key, c) => [key, parseNumber(cells[c + 1]!, `付録B §1 ${label}`)]),
    ) as Record<ScoreAttributeKey, number>;
    const ordered = Object.fromEntries(SCORE_ATTRIBUTE_KEYS.map((k) => [k, values[k]])) as Record<
      ScoreAttributeKey,
      number
    >;
    if (ordered.score_compat !== ordered.score_compat_minus) {
      fail(`付録B §1 の「${label}」でスコア(相性)とスコア(-相性)が異なります`);
    }
    return { choiceCode: code, label, ...ordered };
  });
}

// ---------------------------------------------------------------------------
// 手順 3: 式（付録B §2〜§5）

interface Term {
  questionNo: number;
  attribute: ScoreAttributeKey;
  sign: 1 | -1;
}
interface Formula {
  terms: Term[];
  constant: number;
}

/** 属性名は長いものから照合する（`スコア(-相性)` と `スコア` などの前方一致を避ける。08 §7.3） */
const ATTRIBUTE_NAMES_LONGEST_FIRST = Object.keys(ATTRIBUTE_LABELS).sort(
  (a, b) => b.length - a.length,
);

function parseFormula(block: string, expectedName: string): Formula {
  const text = block.replace(/\s+/g, " ").trim();
  const eq = text.indexOf(" = ");
  if (eq < 0) fail(`「${expectedName}」の式に = がありません`);
  const lhs = text.slice(0, eq).trim();
  if (lhs !== expectedName) fail(`式の左辺「${lhs}」が見出し「${expectedName}」と一致しません`);
  const rhs = text.slice(eq + 3);

  const terms: Term[] = [];
  let constant = 0;
  let pos = 0;
  let first = true;
  while (pos < rhs.length) {
    if (rhs[pos] === " ") {
      pos += 1;
      continue;
    }
    let sign: 1 | -1 = 1;
    const op = rhs[pos];
    if (op === "+" || op === "-" || op === "−") {
      sign = op === "+" ? 1 : -1;
      pos += 1;
      while (rhs[pos] === " ") pos += 1;
    } else if (!first) {
      fail(`「${expectedName}」の式で演算子がありません: …${rhs.slice(pos, pos + 20)}`);
    }
    first = false;

    const q = /^Q(\d+)\./.exec(rhs.slice(pos));
    if (q) {
      pos += q[0].length;
      const rest = rhs.slice(pos);
      const name = ATTRIBUTE_NAMES_LONGEST_FIRST.find(
        (n) => rest.startsWith(n) && (rest.length === n.length || rest[n.length] === " "),
      );
      if (!name)
        fail(`「${expectedName}」の式で配点属性を読めません: Q${q[1]}.${rest.slice(0, 12)}`);
      pos += name.length;
      terms.push({ questionNo: Number(q[1]), attribute: ATTRIBUTE_LABELS[name]!, sign });
      continue;
    }
    const num = /^(\d+(?:\.\d+)?)(?= |$)/.exec(rhs.slice(pos));
    if (num) {
      pos += num[0].length;
      constant += sign * Number(num[1]);
      continue;
    }
    fail(`「${expectedName}」の式を解析できません: …${rhs.slice(pos, pos + 20)}`);
  }
  return { terms, constant };
}

function parseFormulaSection<L extends { readonly key: string }>(
  section: readonly string[],
  labels: readonly L[],
  nameOf: (l: L) => string,
  where: string,
): Map<string, Formula> {
  const subsections = splitSections(section.join("\n"), "###");
  const expected = labels.map(nameOf);
  const actual = [...subsections.keys()];
  if (actual.join("|") !== expected.join("|")) {
    fail(
      `${where} の見出しが想定と異なります。\n  実際: ${actual.join("、")}\n  想定: ${expected.join("、")}`,
    );
  }
  const result = new Map<string, Formula>();
  for (const label of labels) {
    const name = nameOf(label);
    result.set(
      label.key,
      parseFormula(codeBlock(subsections.get(name)!, `${where}「${name}」`), name),
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// 手順 4: タイプ表（付録B §6）

interface TypeRow {
  socialStyle: string;
  plus: number[];
  minus: number[];
  important: number[];
}

function parseQuestionList(cell: string, where: string): number[] {
  if (cell === "－" || cell === "-" || cell === "") return [];
  if (!/^Q\d+(, Q\d+)*$/.test(cell)) fail(`${where}: 設問の列挙を読めません: ${cell}`);
  return [...cell.matchAll(/Q(\d+)/g)].map((m) => Number(m[1]));
}

function parseTypeTable(section: readonly string[]): Map<string, TypeRow> {
  const [header, ...body] = tableRows(section);
  const expectedHeader =
    "タイプ名|組織内分類|加算設問（タイプ用）|減算設問（タイプ用）|重要設問（スコア(重要)）";
  if (header?.join("|") !== expectedHeader) fail(`付録B §6 の表の見出しが想定外です: ${header}`);
  const rows = new Map<string, TypeRow>();
  for (const cells of body) {
    if (cells.length !== 5) fail(`付録B §6 の表の列数が 5 ではありません: ${cells.join(" | ")}`);
    const [name, style, plus, minus, important] = cells as [string, string, string, string, string];
    if (rows.has(name)) fail(`付録B §6 でタイプが重複しています: ${name}`);
    rows.set(name, {
      socialStyle: style,
      plus: parseQuestionList(plus, `${name} 加算`),
      minus: parseQuestionList(minus, `${name} 減算`),
      important: parseQuestionList(important, `${name} 重要`),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 生成物の組み立て

interface IndicatorItem {
  key: string;
  [field: string]: unknown;
  constant: number;
  multiplier: number;
  clampMin: number | null;
  terms: Term[];
}

interface Generated {
  questions: QuestionItem[];
  choices: ChoiceItem[];
  traits: IndicatorItem[];
  compatibility: IndicatorItem[];
  aptitudes: IndicatorItem[];
  risks: IndicatorItem[];
  aptitudeTypes: IndicatorItem[];
  socialStyles: Array<Record<string, unknown>>;
}

function build(appendixA: string, appendixB: string): Generated {
  const questions = parseQuestions(appendixA);
  const sectionsB = splitSections(appendixB, "##");

  const choices = parseChoiceScores(sectionByPrefix(sectionsB, "1. "));

  const traitFormulas = parseFormulaSection(
    sectionByPrefix(sectionsB, "2. "),
    TRAIT_LABELS,
    (l) => l.label,
    "付録B §2",
  );
  const traits = TRAIT_LABELS.map((l, i): IndicatorItem => {
    const f = traitFormulas.get(l.key)!;
    return {
      key: l.key,
      label: l.label,
      sortOrder: i + 1,
      constant: f.constant,
      multiplier: 1,
      clampMin: null,
      terms: f.terms,
    };
  });

  const compatFormulas = parseFormulaSection(
    sectionByPrefix(sectionsB, "3. "),
    COMPATIBILITY_LABELS,
    (l) => l.label,
    "付録B §3",
  );
  const compatibility = COMPATIBILITY_LABELS.map((l, i): IndicatorItem => {
    const f = compatFormulas.get(l.key)!;
    return {
      key: l.key,
      label: l.label,
      lowLabel: l.lowLabel,
      highLabel: l.highLabel,
      sortOrder: i + 1,
      constant: f.constant,
      multiplier: 1,
      clampMin: null,
      terms: f.terms,
    };
  });

  const aptitudeFormulas = parseFormulaSection(
    sectionByPrefix(sectionsB, "4. "),
    APTITUDE_LABELS,
    (l) => l.internalName,
    "付録B §4",
  );
  const aptitudes = APTITUDE_LABELS.map((l, i): IndicatorItem => {
    const f = aptitudeFormulas.get(l.key)!;
    return {
      key: l.key,
      internalName: l.internalName,
      label: l.label,
      sortOrder: i + 1,
      constant: f.constant,
      multiplier: 1,
      clampMin: 0,
      terms: f.terms,
    };
  });

  const riskFormulas = parseFormulaSection(
    sectionByPrefix(sectionsB, "5. "),
    RISK_LABELS,
    (l) => l.label,
    "付録B §5",
  );
  const risks = RISK_LABELS.map((l, i): IndicatorItem => {
    const f = riskFormulas.get(l.key)!;
    return {
      key: l.key,
      label: l.label,
      shortLabel: l.shortLabel,
      aiLabel: l.aiLabel,
      sortOrder: i + 1,
      constant: f.constant,
      multiplier: 5,
      clampMin: null,
      terms: f.terms,
    };
  });

  const typeRows = parseTypeTable(sectionByPrefix(sectionsB, "6. "));
  const typeNames = [...typeRows.keys()];
  const expectedTypeNames = APTITUDE_TYPE_LABELS.map((l) => l.label);
  if (typeNames.join("|") !== expectedTypeNames.join("|")) {
    fail(`付録B §6 のタイプの並びが 00 §1.6 と異なります: ${typeNames.join("、")}`);
  }
  const aptitudeTypes = APTITUDE_TYPE_LABELS.map((l, i): IndicatorItem => {
    const row = typeRows.get(l.label)!;
    if (row.socialStyle !== l.socialStyle) {
      fail(
        `付録B §6 の「${l.label}」の組織内分類 ${row.socialStyle} が 00 §1.6 の ${l.socialStyle} と異なります`,
      );
    }
    const terms: Term[] = [
      ...row.plus.map((q): Term => ({ questionNo: q, attribute: "score_type", sign: 1 })),
      ...row.minus.map((q): Term => ({ questionNo: q, attribute: "score_type", sign: -1 })),
      ...row.important.map((q): Term => ({ questionNo: q, attribute: "score_important", sign: 1 })),
    ];
    return {
      key: l.key,
      label: l.label,
      shortLabel: l.shortLabel,
      socialStyle: l.socialStyle,
      characterName: l.characterName,
      characterNameHiragana: l.characterNameHiragana,
      sortOrder: i + 1,
      constant: 0,
      multiplier: 1,
      clampMin: null,
      terms,
    };
  });

  // 手順 5: スタイル（式を持たないため定数から。08 §7.3）
  const socialStyles = SOCIAL_STYLE_LABELS.map((l, i) => ({
    key: l.key,
    labelEn: l.labelEn,
    labelKatakana: l.labelKatakana,
    labelJa: l.labelJa,
    color: l.color,
    sortOrder: i + 1,
    chartOrder: l.chartOrder,
  }));

  const generated = {
    questions,
    choices,
    traits,
    compatibility,
    aptitudes,
    risks,
    aptitudeTypes,
    socialStyles,
  };
  checkInvariants(generated);
  checkReverseLookup(generated, appendixA);
  return generated;
}

// ---------------------------------------------------------------------------
// 不変条件（03 §4.2、§10.3 の M-01〜M-06 と同じ内容。テストでも検査する）

function count<T>(items: readonly T[], pred: (t: T) => boolean): number {
  return items.filter(pred).length;
}

function expect(condition: boolean, message: string): void {
  if (!condition) fail(`不変条件違反: ${message}`);
}

function checkInvariants(g: Generated): void {
  const indicators = [
    ...g.traits,
    ...g.compatibility,
    ...g.aptitudes,
    ...g.risks,
    ...g.aptitudeTypes,
  ];
  for (const ind of indicators) {
    for (const t of ind.terms) {
      expect(
        Number.isInteger(t.questionNo) &&
          t.questionNo >= 1 &&
          t.questionNo <= SCORED_QUESTION_COUNT,
        `${ind.key} に採点対象外の設問 Q${t.questionNo} があります`,
      );
    }
  }
  expect(g.traits.map((t) => t.key).join() === TRAIT_KEYS.join(), "16 尺度の並び");
  for (const t of g.traits) {
    expect(t.terms.length === 15, `${t.key} の項数 ${t.terms.length}（15 のはず）`);
    expect(
      t.terms.every((x) => x.attribute === "score"),
      `${t.key} の属性が score 以外を含む`,
    );
    expect(count(t.terms, (x) => x.sign === 1) === 8, `${t.key} の加算項が 8 ではない`);
    expect(t.constant === 14, `${t.key} の定数が 14 ではない`);
  }

  expect(g.compatibility.map((c) => c.key).join() === COMPATIBILITY_KEYS.join(), "相性 5 軸の並び");
  const expectedCompatMinus = [2, 0, 0, 4, 16];
  g.compatibility.forEach((c, i) => {
    expect(c.terms.length === 20, `${c.key} の項数 ${c.terms.length}（20 のはず）`);
    expect(
      c.terms.every((x) => x.attribute === "score_compat" || x.attribute === "score_compat_minus"),
      `${c.key} の属性`,
    );
    expect(
      c.terms.every((x) => x.sign === -1 || x.attribute === "score_compat"),
      `${c.key} の加算項に score_compat_minus がある`,
    );
    expect(
      count(c.terms, (x) => x.sign === -1) === expectedCompatMinus[i],
      `${c.key} の減算項の数`,
    );
    expect(c.constant === 0, `${c.key} の定数`);
  });
  const env = g.compatibility[0]!.terms.filter((x) => x.sign === -1);
  expect(
    env.length === 2 &&
      env.some((x) => x.questionNo === 4 && x.attribute === "score_compat") &&
      env.some((x) => x.questionNo === 60 && x.attribute === "score_compat_minus"),
    "適応する環境の減算項は Q4（スコア(相性)）と Q60（スコア(-相性)）",
  );

  expect(g.aptitudes.map((a) => a.key).join() === APTITUDE_KEYS.join(), "資質 4 型の並び");
  for (const a of g.aptitudes) {
    expect(a.terms.length === 26, `${a.key} の項数 ${a.terms.length}（26 のはず）`);
    expect(
      a.terms.every((x) => x.sign === 1),
      `${a.key} に減算項がある`,
    );
    expect(
      a.terms.every((x) =>
        ["social_plus", "social_minus", "social_important"].includes(x.attribute),
      ),
      `${a.key} の属性`,
    );
    expect(
      count(a.terms, (x) => x.attribute === "social_important") === 6,
      `${a.key} の重要項の数`,
    );
    expect(a.constant === 0, `${a.key} の定数`);
  }
  const selfActualizing = g.aptitudes.find((a) => a.key === "self_actualizing")!;
  expect(
    count(selfActualizing.terms, (x) => x.questionNo === 13 && x.attribute === "social_plus") === 2,
    "自己実現型の Q13 +ソーシャルは 2 回（03 D3-04）",
  );

  expect(g.risks.map((r) => r.key).join() === RISK_KEYS.join(), "リスク 7 項目の並び");
  const expectedRiskType = [4, 0, 1, 4, 3, 1, 0];
  g.risks.forEach((r, i) => {
    expect(r.terms.length === 10, `${r.key} の項数 ${r.terms.length}（10 のはず）`);
    expect(
      r.terms.every((x) => x.sign === 1),
      `${r.key} に減算項がある`,
    );
    expect(
      r.terms.every((x) => x.attribute === "score" || x.attribute === "score_type"),
      `${r.key} の属性`,
    );
    expect(
      count(r.terms, (x) => x.attribute === "score_type") === expectedRiskType[i],
      `${r.key} の score_type 項の数`,
    );
    expect(r.constant === 0, `${r.key} の定数`);
  });

  expect(g.aptitudeTypes.map((t) => t.key).join() === APTITUDE_TYPE_KEYS.join(), "16 タイプの並び");
  const expectedTypeMinus: Record<string, number[]> = {
    generalist: [45, 46],
    scientist: [11, 25, 45],
    conductor: [4],
  };
  for (const t of g.aptitudeTypes) {
    const typeTerms = t.terms.filter((x) => x.attribute === "score_type");
    const important = t.terms.filter((x) => x.attribute === "score_important");
    expect(typeTerms.length === 20, `${t.key} の加算 + 減算が ${typeTerms.length}（20 のはず）`);
    expect(important.length === 6 && important.every((x) => x.sign === 1), `${t.key} の重要項`);
    expect(t.terms.length === 26, `${t.key} の項数`);
    const minus = typeTerms.filter((x) => x.sign === -1).map((x) => x.questionNo);
    expect(
      minus.join() === (expectedTypeMinus[t.key] ?? []).join(),
      `${t.key} の減算設問 ${minus.join()}`,
    );
  }
  for (const style of SOCIAL_STYLE_KEYS) {
    expect(
      count(g.aptitudeTypes, (t) => t.socialStyle === style) === 4,
      `${style} に属するタイプが 4 つではない`,
    );
  }

  expect(
    g.socialStyles.map((s) => s.key).join() === SOCIAL_STYLE_KEYS.join(),
    "スタイルの sortOrder 順",
  );
  expect(g.socialStyles.map((s) => s.chartOrder).join() === "1,2,4,3", "スタイルの chartOrder");

  // 設問の使用状況（03 §4.2）: Q64・Q144 はどの指標にも使われない
  const used = new Set(indicators.flatMap((ind) => ind.terms.map((t) => t.questionNo)));
  for (let q = 1; q <= SCORED_QUESTION_COUNT; q += 1) {
    const shouldBeUsed = q !== 64 && q !== 144;
    expect(used.has(q) === shouldBeUsed, `Q${q} の使用状況（Q64・Q144 のみ指標に未使用のはず）`);
  }
}

// ---------------------------------------------------------------------------
// 手順 6: 付録A の逆引き表との照合（08 §7.3）

const ATTRIBUTE_NAME_BY_KEY = new Map(
  Object.entries(ATTRIBUTE_LABELS).map(([name, key]) => [key, name]),
);

function checkReverseLookup(g: Generated, appendixA: string): void {
  const expected = new Map<number, string[]>();
  const add = (name: string, terms: readonly Term[]): void => {
    for (const t of terms) {
      const list = expected.get(t.questionNo) ?? [];
      list.push(`${name}: ${t.sign === 1 ? "+" : "−"}${ATTRIBUTE_NAME_BY_KEY.get(t.attribute)!}`);
      expected.set(t.questionNo, list);
    }
  };
  g.traits.forEach((x) => add(String(x.label), x.terms));
  g.compatibility.forEach((x) => add(String(x.label), x.terms));
  g.aptitudes.forEach((x) => add(String(x.internalName), x.terms));
  g.risks.forEach((x) => add(String(x.label), x.terms));
  g.aptitudeTypes.forEach((x) => add(String(x.label), x.terms));

  const rows = tableRows(
    sectionByPrefix(splitSections(appendixA, "##"), "設問ごとの採点への使われ方"),
  );
  const [header, ...body] = rows;
  if (header?.join("|") !== "Q|設問文|使用先（指標: 符号・属性）|信頼係数") {
    fail(`付録A の逆引き表の見出しが想定外です: ${header}`);
  }
  if (body.length !== TOTAL_QUESTION_COUNT)
    fail(`付録A の逆引き表が ${body.length} 行です（204 行のはず）`);
  body.forEach((cells, i) => {
    const questionNo = parseNumber(cells[0]!, "付録A 逆引き表の設問番号");
    if (questionNo !== i + 1)
      fail(`付録A の逆引き表の設問番号が連番ではありません: Q${questionNo}`);
    if (cells[1] !== g.questions[i]!.text)
      fail(`付録A の逆引き表の設問文が設問表と異なります: Q${questionNo}`);
    const actual = cells[2] === "（指標には未使用）" ? [] : cells[2]!.split("、");
    const want = expected.get(questionNo) ?? [];
    if ([...actual].sort().join("\n") !== [...want].sort().join("\n")) {
      fail(
        `付録A の逆引き表と付録B の式が一致しません: Q${questionNo}\n  付録A: ${actual.join("、")}\n  付録B: ${want.join("、")}`,
      );
    }
    const reliability = questionNo <= SCORED_QUESTION_COUNT ? "信頼係数" : "－";
    if (cells[3] !== reliability) fail(`付録A の逆引き表の信頼係数列が不正です: Q${questionNo}`);
  });
}

// ---------------------------------------------------------------------------
// 出力

interface OutputFile {
  fileName: string;
  sources: string[];
  kind: string;
  items: unknown[];
}

function outputs(g: Generated): OutputFile[] {
  return [
    {
      fileName: "questions.json",
      sources: [SRC_A, SRC_LAYOUT],
      kind: "question",
      items: g.questions,
    },
    {
      fileName: "choice-scores.json",
      sources: [SRC_B, SRC_LABELS],
      kind: "choice_score",
      items: g.choices,
    },
    { fileName: "traits.json", sources: [SRC_B, SRC_LABELS], kind: "trait", items: g.traits },
    {
      fileName: "compatibility.json",
      sources: [SRC_B, SRC_LABELS],
      kind: "compatibility",
      items: g.compatibility,
    },
    {
      fileName: "aptitudes.json",
      sources: [SRC_B, SRC_LABELS],
      kind: "aptitude",
      items: g.aptitudes,
    },
    { fileName: "risks.json", sources: [SRC_B, SRC_LABELS], kind: "risk", items: g.risks },
    {
      fileName: "aptitude-types.json",
      sources: [SRC_B, SRC_LABELS],
      kind: "aptitude_type",
      items: g.aptitudeTypes,
    },
    {
      fileName: "social-styles.json",
      sources: [SRC_LABELS],
      kind: "social_style",
      items: g.socialStyles,
    },
  ];
}

function render(file: OutputFile): string {
  return formatJson({
    generatedFrom: file.sources,
    sourceHash: sourceHashes(file.sources),
    generatorVersion: GENERATOR_VERSION,
    scoringVersion: SCORING_VERSION,
    kind: file.kind,
    items: file.items,
  });
}

function main(): void {
  const check = process.argv.includes("--check");
  const generated = build(readSource(SRC_A), readSource(SRC_B));
  const files = outputs(generated).map((f) => ({ ...f, content: render(f) }));
  const count = writeOrCheck(files, OUT_DIR, { check, generateCommand: "pnpm masters:generate" });
  console.log(
    check
      ? `マスタ生成物は付録と一致しています（${count} ファイル）。`
      : `${count} ファイルを ${OUT_DIR}/ に生成しました（ページ構成: ${QUESTION_PAGE_LAYOUT.pageSizes.join("・")}）。`,
  );
}

/** テストから解析・検査だけを呼べるように公開する（ファイルは書かない） */
export { build, GenerationError };

const isEntryPoint =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
  try {
    main();
  } catch (error) {
    if (error instanceof GenerationError) {
      console.error(`マスタの生成に失敗しました: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

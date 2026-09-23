// 付録（Markdown）から生成物を作るスクリプトの共通部品（08 §7）。generate-masters.ts と generate-texts.ts が使う
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export class GenerationError extends Error {}

export function fail(message: string): never {
  throw new GenerationError(message);
}

export function readSource(relPath: string): string {
  return readFileSync(path.join(ROOT, relPath), "utf8");
}

export function sha256(relPath: string): string {
  return `sha256:${createHash("sha256")
    .update(readFileSync(path.join(ROOT, relPath)))
    .digest("hex")}`;
}

/** `## 見出し` 単位に分割する（見出し行 → 本文行の配列） */
export function splitSections(markdown: string, level: "##" | "###"): Map<string, string[]> {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  const prefix = `${level} `;
  for (const line of markdown.split("\n")) {
    if (line.startsWith(prefix)) {
      const title = line.slice(prefix.length).trim();
      if (sections.has(title)) fail(`見出しが重複しています: ${line}`);
      current = [];
      sections.set(title, current);
    } else if (level === "###" && line.startsWith("## ")) {
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return sections;
}

export function sectionByPrefix(sections: Map<string, string[]>, titlePrefix: string): string[] {
  const hits = [...sections.entries()].filter(([title]) => title.startsWith(titlePrefix));
  if (hits.length !== 1)
    fail(`見出し「${titlePrefix}…」が 1 つではありません（${hits.length} 件）`);
  return hits[0]![1];
}

/** Markdown の表の行（区切り行を除く）をセル配列にする */
export function tableRows(lines: readonly string[]): string[][] {
  return lines
    .filter((l) => l.startsWith("|"))
    .map((l) => {
      if (!l.endsWith("|")) fail(`表の行が | で終わっていません: ${l}`);
      return l
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
    })
    .filter((cells) => !cells.every((c) => /^:?-+:?$/.test(c)));
}

/** 最初のコードブロックの中身 */
export function codeBlock(lines: readonly string[], where: string): string {
  const start = lines.findIndex((l) => l.startsWith("```"));
  const end = lines.findIndex((l, i) => i > start && l.startsWith("```"));
  if (start < 0 || end < 0) fail(`${where} にコードブロックがありません`);
  return lines.slice(start + 1, end).join("\n");
}

export function parseNumber(cell: string, where: string): number {
  if (!/^-?\d+(\.\d+)?$/.test(cell)) fail(`${where}: 数値ではありません: ${cell}`);
  return Number(cell);
}

export interface RenderedFile {
  readonly fileName: string;
  readonly sources: readonly string[];
  readonly content: string;
}

export function sourceHashes(sources: readonly string[]): Record<string, string> {
  return Object.fromEntries(sources.map((s) => [s, sha256(s)]));
}

function readCommittedHash(filePath: string): unknown {
  try {
    return (JSON.parse(readFileSync(filePath, "utf8")) as { sourceHash?: unknown }).sourceHash;
  } catch {
    return undefined;
  }
}

/**
 * --check なら生成物とコミット済みの内容を比べ（08 §7.6。不一致は終了コード 1）、そうでなければ書き込む。
 * 戻り値は書き込み・検査したファイル数
 */
export function writeOrCheck(
  files: readonly RenderedFile[],
  outDir: string,
  options: { readonly check: boolean; readonly generateCommand: string },
): number {
  const absDir = path.join(ROOT, outDir);
  if (options.check) {
    const problems: string[] = [];
    for (const f of files) {
      const target = path.join(absDir, f.fileName);
      if (!existsSync(target)) {
        problems.push(`${outDir}/${f.fileName} がありません`);
        continue;
      }
      if (JSON.stringify(readCommittedHash(target)) !== JSON.stringify(sourceHashes(f.sources))) {
        problems.push(
          `${outDir}/${f.fileName}: 生成元（${f.sources.join("、")}）が変わっています。再生成が必要です`,
        );
      } else if (readFileSync(target, "utf8") !== f.content) {
        problems.push(`${outDir}/${f.fileName}: 再生成結果とコミット済みの内容が一致しません`);
      }
    }
    if (problems.length > 0) {
      console.error(problems.join("\n"));
      console.error(`${options.generateCommand} を実行して生成物をコミットしてください。`);
      process.exit(1);
    }
    return files.length;
  }
  mkdirSync(absDir, { recursive: true });
  for (const f of files) writeFileSync(path.join(absDir, f.fileName), f.content);
  return files.length;
}

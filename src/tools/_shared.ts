import { resolve, isAbsolute } from "node:path";
import { stat, readFile } from "node:fs/promises";

import { log, text, isCancel } from "@clack/prompts";
import { tryCatch } from "../utils.js";

let alwaysAllowWrite = false;

let cachedIgnore: string[] | null = null;
let cachedMtime: number | null = null;

export async function getIgnorePatterns(
  projectRoot: string,
): Promise<string[]> {
  let gitignorePath = resolve(projectRoot, ".gitignore");
  let statRes = await tryCatch(stat(gitignorePath));
  let mtime = statRes.ok ? statRes.data.mtimeMs : -1;
  if (cachedIgnore && cachedMtime === mtime) return cachedIgnore;

  let readRes = await tryCatch(readFile(gitignorePath, { encoding: "utf-8" }));
  let patterns: string[] = readRes.ok
    ? readRes.data
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
        .map((p) => {
          if (p.endsWith("/")) return `${p}**`;
          if (!p.includes("*") && !p.includes("?")) return `${p}/**`;
          return p;
        })
    : [];
  patterns.push(".git/**");
  cachedIgnore = patterns;
  cachedMtime = mtime;
  return patterns;
}

export function ensureProjectPath(projectRoot: string, rel: string): string {
  let abs = isAbsolute(rel) ? rel : resolve(projectRoot, rel);
  if (!abs.startsWith(projectRoot))
    throw new Error("Path outside project root");
  return abs;
}

export async function confirm(items: string[]): Promise<Set<number> | false> {
  let always = alwaysAllowWrite;
  if (always) return new Set(items.map((_, i) => i));

  let header = "⚠️ Files requested for writing";
  let list = items.map((p, i) => `  ${i + 1}) ${p}`).join("\n");
  let help = "Allow once [y], Always [a], Deny [n], or numbers (e.g. 1 3): ";

  log.step(`${header}\n${list}`);
  let answer = (await text({ message: help })).toString();
  if (isCancel(answer)) {
    throw Error("user cancelled");
  }

  if (["y", "yes"].includes(answer)) {
    return new Set(items.map((_, i) => i));
  }
  if (["a", "always"].includes(answer)) {
    alwaysAllowWrite = true;
    return new Set(items.map((_, i) => i));
  }
  if (["n", "no", "deny"].includes(answer)) return false;

  let picks = answer
    .split(/[ ,]+/)
    .map((t) => parseInt(t, 10) - 1)
    .filter((n) => Number.isFinite(n) && n >= 0 && n < items.length);
  if (picks.length) return new Set(picks);

  return false;
}

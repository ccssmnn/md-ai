import { resolve, isAbsolute } from "node:path";
import { stat, readFile } from "node:fs/promises";
import { tryCatch } from "../utils.js";

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
  if (!abs.startsWith(projectRoot)) {
    throw new Error("Path outside project root");
  }
  return abs;
}

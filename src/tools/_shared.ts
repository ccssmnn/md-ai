import { resolve, isAbsolute } from "node:path";
import { stat, readFile } from "node:fs/promises";

import { glob } from "glob";

import { tryCatch } from "../utils.js";

export function ensureProjectPath(projectRoot: string, rel: string): string {
  let abs = isAbsolute(rel) ? rel : resolve(projectRoot, rel);
  if (!abs.startsWith(projectRoot)) {
    throw new Error("Path outside project root");
  }
  return abs;
}

export async function globFiles(
  patterns: string[],
  cwd: string,
): Promise<string[]> {
  let ignore = await getIgnorePatterns(cwd);
  let fileSet = await glob(
    patterns.map((p) => p.trim()),
    {
      cwd,
      ignore,
      dot: true, // many projects make heavy use of dotfiles (.gitignore, .prettierignore, ...)
      matchBase: true, // for the sake of simplicity, we allow *.js to match javascript files in subdirectories
      nodir: true, // only match files, not directories. useful when searching for `**/*`
    },
  );
  return fileSet;
}

let cachedIgnore: string[] | null = null;
let cachedMtime: number | null = null;

async function getIgnorePatterns(projectRoot: string): Promise<string[]> {
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
          if (!p.includes("*") && !p.includes("?")) return p;
          return p;
        })
    : [];
  patterns.push(".git/**");
  cachedIgnore = patterns;
  cachedMtime = mtime;
  return patterns;
}

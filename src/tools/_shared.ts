import { resolve, isAbsolute } from "node:path";
import { stat, readFile } from "node:fs/promises";

import { glob } from "glob";

import { tryCatch } from "../utils/index.js";
import { log } from "@clack/prompts";
import { setTimeout } from "node:timers/promises";

export async function maybeAutoMode(options: {
  auto: boolean;
  autoTimeout: number;
}) {
  if (!options.auto) return false;

  const abortController = new AbortController();

  const keypressListener = () => {
    abortController.abort();
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", keypressListener);

  try {
    for (let i = options.autoTimeout; i > 0; i--) {
      log.info(
        `auto: waiting ${i}s for cancellation... (press any key to cancel)`,
      );
      await setTimeout(1000, undefined, {
        signal: abortController.signal,
      });
    }
    return true;
  } catch (e) {
    // aborted
    log.info("auto-mode: cancelled by user");
    return false;
  } finally {
    process.stdin.off("data", keypressListener);
    process.stdin.pause();
    process.stdin.setRawMode(false);
  }
}

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
  let patterns = readRes.ok ? parseGitignore(readRes.data) : [];
  patterns.push(".git/**");
  cachedIgnore = patterns;
  cachedMtime = mtime;
  return patterns;
}

export function parseGitignore(content: string): Array<string> {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .flatMap((raw) => {
      let isNeg = raw.startsWith("!");
      let pat = isNeg ? raw.slice(1) : raw;
      let anchored = pat.startsWith("/");
      if (anchored) pat = pat.slice(1);

      let isDirRule =
        pat.endsWith("/") || (!pat.includes("*") && !pat.includes("."));
      if (isDirRule) pat = pat.replace(/\/$/, "");

      let base = anchored ? pat : `**/${pat}`;

      if (isDirRule) {
        let dirPatterns = [`${base}`, `${base}/**`];
        return isNeg ? dirPatterns.map((p) => `!${p}`) : dirPatterns;
      }

      let filePattern = anchored ? pat : `**/${pat}`;
      return [isNeg ? `!${filePattern}` : filePattern];
    });
}

let fileAccessTracker = new Map<
  string,
  {
    lastReadTime: number;
    lastKnownMtime: number;
  }
>();

export function trackFileAccess(absolutePath: string, mtime: number): void {
  fileAccessTracker.set(absolutePath, {
    lastReadTime: Date.now(),
    lastKnownMtime: mtime,
  });
}

export async function checkFileVersions(filePaths: string[]): Promise<{
  outdatedFiles: string[];
}> {
  let outdatedFiles: string[] = [];

  for (let filePath of filePaths) {
    let accessInfo = fileAccessTracker.get(filePath);
    if (!accessInfo) {
      // File was never read by the model, consider it outdated
      outdatedFiles.push(filePath);
      continue;
    }

    let statRes = await tryCatch(stat(filePath));
    if (!statRes.ok) {
      // File doesn't exist anymore, skip version check
      continue;
    }

    if (statRes.data.mtimeMs > accessInfo.lastKnownMtime) {
      // File was modified since last read
      outdatedFiles.push(filePath);
    }
  }

  return {
    outdatedFiles,
  };
}


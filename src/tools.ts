import { resolve } from "node:path";
import { unlink, writeFile, readFile, stat } from "node:fs/promises";
import { cwd } from "node:process";

import { z } from "zod";
import { tool } from "ai";
import { glob } from "glob";

import { tryCatch } from "./utils.js";
import { isCancel, log, text } from "@clack/prompts";

let alwaysAllowRead = false;
let alwaysAllowWrite = false;

let projectRoot = cwd();
let cachedIgnore: string[] | null = null;
let cachedMtime: number | null = null;

async function getIgnorePatterns(): Promise<string[]> {
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

function ensureProjectPath(rel: string): string {
  let abs = resolve(projectRoot, rel);
  if (!abs.startsWith(projectRoot))
    throw new Error("Path outside project root");
  return abs;
}

async function confirm(
  kind: "read" | "write",
  items: string[],
): Promise<Set<number> | false> {
  let always = kind === "read" ? alwaysAllowRead : alwaysAllowWrite;
  if (always) return new Set(items.map((_, i) => i));

  let header =
    kind === "read"
      ? "🔒  Files requested for reading"
      : "⚠️  Files requested for writing";
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
    if (kind === "read") alwaysAllowRead = true;
    else alwaysAllowWrite = true;
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

export function createListFilesTool() {
  return tool({
    description: "list file paths on disk matching one or more glob patterns.",
    parameters: z.object({
      patterns: z.array(z.string()).describe("Glob patterns to list"),
    }),
    execute: async ({ patterns }) => {
      let ignore = await getIgnorePatterns();
      let fileSet = new Set<string>();
      for (let pat of patterns) {
        (await glob(pat.trim(), { dot: true, ignore })).forEach((p) =>
          fileSet.add(p),
        );
      }
      let files = Array.from(fileSet);
      log.step(
        `list files matching ${patterns.join(", ")}: ${files.join(", ")}`,
      );
      return { ok: true, patterns, files };
    },
  });
}

export function createReadFilesTool({ auto = false } = {}) {
  return tool({
    description:
      "open one or more files contents that match one or more glob patterns",
    parameters: z.object({
      patterns: z.array(z.string()).describe("glob patterns for files to open"),
    }),
    execute: async ({ patterns }) => {
      let ignore = await getIgnorePatterns();
      let matched = new Set<string>();
      for (let pat of patterns) {
        (await glob(pat.trim(), { dot: true, ignore })).forEach((p) =>
          matched.add(p),
        );
      }
      let files = Array.from(matched);
      if (files.length === 0)
        return { ok: false, error: "No files match that pattern", patterns };

      let allowSet: Set<number> | false = new Set(files.map((_, i) => i));
      if (!auto) allowSet = await confirm("read", files);
      if (allowSet === false || allowSet.size === 0)
        return { ok: false, error: "User denied read request" };

      let allowedFiles = files.filter((_, i) => allowSet!.has(i));
      let results = await Promise.all(
        allowedFiles.map(async (rel) => {
          let abs = ensureProjectPath(rel);
          let res = await tryCatch(readFile(abs, "utf-8"));
          return {
            path: rel,
            ok: res.ok,
            content: res.ok ? res.data : undefined,
            error: res.ok ? undefined : res.error,
          };
        }),
      );
      log.step(`read files: ${results.map((r) => r.path).join(", ")}`);
      return { ok: true, files: results };
    },
  });
}

let lineOperationSchema = z.object({
  op: z.enum(["add", "delete", "replace"]),
  line: z.number().int().nonnegative(),
  content: z.string().optional(),
});

let fileOperationSchema = z
  .object({
    path: z.string(),
    lines: z.array(lineOperationSchema).optional(),
    delete: z.boolean().optional(),
  })
  .refine(
    (o) =>
      [o.lines !== undefined, o.delete === true].filter(Boolean).length === 1,
    { message: "Exactly one of lines or delete must be provided" },
  );

export function createWriteFilesTool({ auto = false } = {}) {
  return tool({
    description: [
      "create, modify, or delete files on disk.",
      "- For modifications: { path, lines: [{op: 'add'|'delete'|'replace', line: number, content?: string}] }",
      "- For deletions: { path, delete: true }",
    ].join(" "),
    parameters: z.object({ files: z.array(fileOperationSchema) }),
    execute: async ({ files }) => {
      let summary = files.map((f) => {
        let action = f.delete
          ? "delete"
          : f.lines !== undefined
            ? "modify"
            : "unknown";
        return `${f.path} (${action})`;
      });

      let allowSet: Set<number> | false = new Set(files.map((_, i) => i));
      if (!auto) allowSet = await confirm("write", summary);
      if (allowSet === false || allowSet.size === 0) {
        return { ok: false, error: "User denied write request" };
      }
      let tasks = files
        .map((f, i) => ({ ...f, idx: i }))
        .filter((f) => allowSet!.has(f.idx));

      let settled = await Promise.allSettled(
        tasks.map(async ({ path, lines, delete: del }) => {
          try {
            let abs = ensureProjectPath(path);
            if (del) {
              await unlink(abs);
              return { path, status: "deleted" as const };
            }
            if (lines !== undefined) {
              let origRes = await tryCatch(readFile(abs, "utf-8"));
              if (!origRes.ok) throw origRes.error;
              let origLines = origRes.data.split("\n");
              let newLines = [...origLines];

              for (let op of lines) {
                if (op.op === "add") {
                  newLines.splice(op.line, 0, op.content!);
                } else if (op.op === "delete") {
                  newLines.splice(op.line, 1);
                } else if (op.op === "replace") {
                  newLines[op.line] = op.content!;
                }
              }

              let updatedContent = newLines.join("\n");
              await writeFile(abs, updatedContent, "utf-8");
              return { path, status: "modified" as const };
            }
            throw new Error("unreachable");
          } catch (err) {
            return {
              path,
              status: "error" as const,
              message: (err as Error).message,
            };
          }
        }),
      );

      let results = settled.map((s) =>
        s.status === "fulfilled" ? s.value : s.reason,
      );
      let ok = results.every((r) => r.status !== "error");
      log.step(
        `write files: ${results
          .map((r) => `${r.path}:${r.status}`)
          .join(", ")}`,
      );
      return { ok, results };
    },
  });
}

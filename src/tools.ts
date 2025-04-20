import { dirname, resolve } from "node:path";
import { mkdir, unlink, writeFile, readFile, stat } from "node:fs/promises";
import { cwd } from "node:process";

import { applyPatch } from "diff";
import { z } from "zod";
import { tool } from "ai";
import { glob } from "glob";

import { tryCatch } from "./utils.js";
import { askUser } from "./prompts.js";

let alwaysAllowRead = false;
let alwaysAllowWrite = false;

const projectRoot = cwd();
let cachedIgnore: string[] | null = null;
let cachedMtime: number | null = null;

async function getIgnorePatterns(): Promise<string[]> {
  const gitignorePath = resolve(projectRoot, ".gitignore");
  const statRes = await tryCatch(stat(gitignorePath));
  const mtime = statRes.ok ? statRes.data.mtimeMs : -1;
  if (cachedIgnore && cachedMtime === mtime) return cachedIgnore;

  const readRes = await tryCatch(
    readFile(gitignorePath, { encoding: "utf-8" }),
  );
  const patterns: string[] = readRes.ok
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
  const abs = resolve(projectRoot, rel);
  if (!abs.startsWith(projectRoot))
    throw new Error("Path outside project root");
  return abs;
}

async function confirm(
  kind: "read" | "write",
  items: string[],
): Promise<Set<number> | false> {
  const always = kind === "read" ? alwaysAllowRead : alwaysAllowWrite;
  if (always) return new Set(items.map((_, i) => i));

  const header =
    kind === "read"
      ? "🔒  Files requested for reading"
      : "⚠️  Files requested for writing";
  const list = items.map((p, i) => `  ${i + 1}) ${p}`).join("\n");
  const help = "Allow once [y], Always [a], Deny [n], or numbers (e.g. 1 3): ";
  const answer = (await askUser(`${header}:\n${list}\n${help}`)).toLowerCase();

  if (["y", "yes"].includes(answer)) {
    return new Set(items.map((_, i) => i));
  }
  if (["a", "always"].includes(answer)) {
    if (kind === "read") alwaysAllowRead = true;
    else alwaysAllowWrite = true;
    return new Set(items.map((_, i) => i));
  }
  if (["n", "no", "deny"].includes(answer)) return false;

  const picks = answer
    .split(/[ ,]+/)
    .map((t) => parseInt(t, 10) - 1)
    .filter((n) => Number.isFinite(n) && n >= 0 && n < items.length);
  if (picks.length) return new Set(picks);

  return false;
}

export function createListFilesTool({ auto = true } = {}) {
  return tool({
    description: "list file paths on disk matching one or more glob patterns.",
    parameters: z.object({
      patterns: z.array(z.string()).describe("Glob patterns to list"),
    }),
    execute: async ({ patterns }) => {
      const ignore = await getIgnorePatterns();
      const fileSet = new Set<string>();
      for (const pat of patterns) {
        (await glob(pat.trim(), { dot: true, ignore })).forEach((p) =>
          fileSet.add(p),
        );
      }
      const files = Array.from(fileSet);
      console.log(
        `🔧: list files matching ${patterns.join(", ")}: ${files.join(", ")}`,
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
      const ignore = await getIgnorePatterns();
      const matched = new Set<string>();
      for (const pat of patterns) {
        (await glob(pat.trim(), { dot: true, ignore })).forEach((p) =>
          matched.add(p),
        );
      }
      const files = Array.from(matched);
      if (files.length === 0)
        return { ok: false, error: "No files match that pattern", patterns };

      let allowSet: Set<number> | false = new Set(files.map((_, i) => i));
      if (!auto) allowSet = await confirm("read", files);
      if (allowSet === false || allowSet.size === 0)
        return { ok: false, error: "User denied read request" };

      const allowedFiles = files.filter((_, i) => allowSet!.has(i));
      const results = await Promise.all(
        allowedFiles.map(async (rel) => {
          const abs = ensureProjectPath(rel);
          const res = await tryCatch(readFile(abs, "utf-8"));
          return {
            path: rel,
            ok: res.ok,
            content: res.ok ? res.data : undefined,
            error: res.ok ? undefined : res.error,
          };
        }),
      );
      console.log(`🔧: read files: ${results.map((r) => r.path).join(", ")}`);
      return { ok: true, files: results };
    },
  });
}

const fileOperationSchema = z
  .object({
    path: z.string(),
    content: z.string().optional(),
    patch: z.string().optional(),
    delete: z.boolean().optional(),
  })
  .refine(
    (o) =>
      [
        o.content !== undefined,
        o.patch !== undefined,
        o.delete === true,
      ].filter(Boolean).length === 1,
    { message: "Exactly one of content, patch, or delete must be provided" },
  );

export function createWriteFilesTool({ auto = false } = {}) {
  return tool({
    description: [
      "create, modify, or delete files on disk.",
      "- For new files: { path, content }",
      "- For modifications: { path, patch } (unified diff against current file).",
      "- For deletions: { path, delete: true }",
    ].join(" "),
    parameters: z.object({ files: z.array(fileOperationSchema) }),
    execute: async ({ files }) => {
      const summary = files.map((f) => {
        const action = f.delete
          ? "delete"
          : f.content !== undefined
            ? "create"
            : "modify";
        return `${f.path} (${action})`;
      });

      let allowSet: Set<number> | false = new Set(files.map((_, i) => i));
      if (!auto) allowSet = await confirm("write", summary);
      if (allowSet === false || allowSet.size === 0)
        return { ok: false, error: "User denied write request" };

      const tasks = files
        .map((f, i) => ({ ...f, idx: i }))
        .filter((f) => allowSet!.has(f.idx));

      const settled = await Promise.allSettled(
        tasks.map(async ({ path, content, patch, delete: del }) => {
          try {
            const abs = ensureProjectPath(path);
            if (del) {
              await unlink(abs);
              return { path, status: "deleted" as const };
            }
            if (content !== undefined) {
              await mkdir(dirname(abs), { recursive: true });
              await writeFile(abs, content, "utf-8");
              return { path, status: "created" as const };
            }
            if (patch !== undefined) {
              const orig = await tryCatch(readFile(abs, "utf-8"));
              if (!orig.ok) throw orig.error;
              const updated = applyPatch(orig.data, patch);
              if (updated === false) throw new Error("patch failed");
              await writeFile(abs, updated, "utf-8");
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

      const results = settled.map((s) =>
        s.status === "fulfilled" ? s.value : s.reason,
      );
      const ok = results.every((r) => r.status !== "error");
      console.log(
        `🔧: write files: ${results
          .map((r) => `${r.path}:${r.status}`)
          .join(", ")}`,
      );
      return { ok, results };
    },
  });
}

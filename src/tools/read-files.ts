import { readFile } from "node:fs/promises";

import { z } from "zod";
import { tool } from "ai";

import { tryCatch } from "#/utils.js";
import { ensureProjectPath, globFiles } from "#/tools/_shared.js";
import { log } from "@clack/prompts";

export function createReadFilesTool(options: { cwd: string }) {
  let { cwd } = options;
  return tool({
    description:
      "open one or more files contents that match one or more glob patterns",
    parameters: z.object({
      patterns: z.array(z.string()).describe("glob patterns for files to open"),
    }),
    execute: async ({ patterns }) => {
      let files = await globFiles(patterns, cwd);
      if (files.length === 0)
        return { ok: false, error: "No files match that pattern", patterns };

      let results = await Promise.all(
        files.map(async (rel) => {
          let abs = ensureProjectPath(cwd, rel);
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

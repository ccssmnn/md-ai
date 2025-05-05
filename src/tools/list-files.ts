import { z } from "zod";
import { tool } from "ai";

import { globFiles } from "./_shared.js";
import { log } from "@clack/prompts";

export function createListFilesTool(options: { cwd: string }) {
  return tool({
    description:
      "list file paths on disk matching one or more glob patterns. does not list files that are ignored by .gitignore",
    parameters: z.object({
      patterns: z.array(z.string()).describe("Glob patterns to list"),
    }),
    execute: async ({ patterns }) => {
      let files = await globFiles(patterns, options.cwd);
      log.step(
        `list files matching ${patterns.join(", ")}: ${files.join(", ")}`,
      );
      return { ok: true, patterns, files };
    },
  });
}

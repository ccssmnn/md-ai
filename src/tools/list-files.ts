import { z } from "zod";
import { tool } from "ai";
import { glob } from "glob";

import { getIgnorePatterns } from "./_shared.js";
import { log } from "@clack/prompts";

export function createListFilesTool(options: { cwd: string }) {
  return tool({
    description: "list file paths on disk matching one or more glob patterns.",
    parameters: z.object({
      patterns: z.array(z.string()).describe("Glob patterns to list"),
    }),
    execute: async ({ patterns }) => {
      let ignore = await getIgnorePatterns(options.cwd);
      let fileSet = new Set<string>();
      let globResults = await Promise.all(
        patterns.map((pat) =>
          glob(pat.trim(), { dot: true, ignore, cwd: options.cwd }),
        ),
      );
      globResults.flatMap((files) => files).forEach((p) => fileSet.add(p));
      let files = Array.from(fileSet);
      log.step(
        `list files matching ${patterns.join(", ")}: ${files.join(", ")}`,
      );
      return { ok: true, patterns, files };
    },
  });
}

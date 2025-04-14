import { z } from "zod";
import { tool } from "ai";
import fs from "node:fs/promises";
import { askUser } from "./prompts.js";
import { tryCatch } from "./utils.js";

export function createReadFileTool({
  shouldAsk = true,
}: {
  shouldAsk?: boolean;
} = {}) {
  let allowedPaths = new Set<string>();

  return tool({
    description: "Read a file from the filesystem.",
    parameters: z.object({
      path: z.string().describe("The path to the file"),
    }),
    execute: async ({ path }) => {
      if (shouldAsk && !allowedPaths.has(path)) {
        let response = await askUser(
          `Allow reading file '${path}'? yes (y), always (a), no (n): `,
        );
        if (response === "a") {
          allowedPaths.add(path);
        }
        let allowed = response === "a" || response === "y";
        if (!allowed) {
          return {
            ok: false,
            path,
            error: "user has denied access to this file",
          };
        }
      }
      let res = await tryCatch(fs.readFile(path, { encoding: "utf-8" }));
      if (!res.ok) {
        return { ok: false, path, error: `Error reading file: ${res.error}` };
      }
      return { ok: true, path, content: res.data };
    },
  });
}

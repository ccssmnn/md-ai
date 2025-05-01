import { spawn } from "node:child_process";

import { z } from "zod";
import { tool } from "ai";
import { log } from "@clack/prompts";

import { globFiles } from "#/tools/_shared.js";

export function createGrepSearchTool(options: { cwd: string }) {
  return tool({
    description:
      "search for a fixed string in files recursively using grep, only within the cwd",
    parameters: z.object({
      query: z.string().describe("The search query (fixed string)"),
      patterns: z
        .array(z.string())
        .default(["**/*"])
        .describe("Glob patterns to include in search"),
    }),
    execute: async ({ query, patterns }) => {
      log.step(
        `searching for "${query}" in cwd ${options.cwd} with patterns: ${patterns.join(", ")}`,
      );

      let fileList = await globFiles(patterns, options.cwd);

      if (!fileList || fileList.length === 0) {
        return { stdout: "No files found matching the patterns.", code: 0 };
      }

      return new Promise<{ stdout: string; code: number }>((resolve) => {
        let args = ["-n", "-H", "-F", query, ...fileList];
        let proc = spawn("grep", args, { cwd: options.cwd });
        let stdout = "";
        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });
        let stderr = "";
        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });
        proc.on("error", (err) => {
          console.error("grep error:", err);
          resolve({ stdout: "", code: -1 });
        });
        proc.on("close", (code) => {
          if (code !== 0) {
            console.error("grep failed with code", code, ":", stderr);
          }
          resolve({ stdout, code: code ?? 0 });
        });
      });
    },
  });
}

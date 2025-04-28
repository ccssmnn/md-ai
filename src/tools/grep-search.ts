import { spawn } from "child_process";
import { z } from "zod";
import { tool } from "ai";
import { log } from "@clack/prompts";

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
      let includeFlags = patterns.map((p) => `--include=${p}`);
      log.step(
        `searching for "${query}" in cwd ${options.cwd} with patterns: ${patterns.join(", ")}`,
      );
      return new Promise<{ stdout: string; code: number }>((resolve) => {
        let args = [
          "-r",
          "--color=never",
          "-n",
          "-H",
          "-F",
          ...includeFlags,
          query,
          ".",
        ];
        let proc = spawn("grep", args, { cwd: options.cwd });
        let stdout = "";
        proc.stdout.on("data", (data) => {
          stdout += data.toString();
        });
        proc.stderr.on("data", () => {
          // ignore stderr
        });
        proc.on("error", () => {
          resolve({ stdout, code: -1 });
        });
        proc.on("close", (code) => {
          resolve({ stdout, code: code ?? 0 });
        });
      });
    },
  });
}

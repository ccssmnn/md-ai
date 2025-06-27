import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { tryCatch } from "../utils/index.js";
import { readFile } from "node:fs/promises";
import { log } from "@clack/prompts";

let defaultConfigPath = join(homedir(), ".config", "md-ai", "config.json");

let configSchema = z.object({
  model: z.string().optional(),
  system: z.string().optional(),
  editor: z.string().optional(),
  compression: z.boolean().optional(),
  auto: z.boolean().optional(),
  "auto-timeout": z.number().optional(),
});

export type MarkdownAIConfig = z.output<typeof configSchema>;

/**
 * loads markdown ai config from the custom path or from the default path
 */
export async function loadConfig(
  path = defaultConfigPath,
): Promise<MarkdownAIConfig> {
  let fileRes = await tryCatch(readFile(path, "utf-8"));
  if (!fileRes.ok) {
    return {};
  }
  let parseRes = tryCatch(() => configSchema.parse(JSON.parse(fileRes.data)));
  if (!parseRes.ok) {
    log.warn(`failed to parse config at ${path}: ${parseRes.error}`);
    return {};
  }
  log.info(`Loaded config file from ${path}`);
  return parseRes.data;
}

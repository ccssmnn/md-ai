#!/usr/bin/env node

import { existsSync } from "node:fs";
import { cwd as processCwd } from "node:process";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { Command } from "commander";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { intro, log, outro } from "@clack/prompts";
import { createProviderRegistry } from "ai";

import { MarkdownAI, type MarkdownAIOptions } from "./chat.js";
import { tryCatch } from "./utils.js";
import { createReadFilesTool } from "./tools/read-files.js";
import { createListFilesTool } from "./tools/list-files.js";
import { createWriteFilesTool } from "./tools/write-files.js";
import { createGrepSearchTool } from "./tools/grep-search.js";

let registry = createProviderRegistry({ anthropic, openai, google });

function fatal(message: string, code = 1): never {
  console.error(`Error: ${message}`);
  process.exit(code);
}

let program = new Command();
program
  .name("md-ai")
  .description("Interactive Markdown-based AI agent")
  .argument("<chatFile>", "Path to the markdown file for the chat history.")
  .option("-s, --system <path>", "Path to a file containing a system prompt")
  .option(
    "-m, --model <provider:model>",
    "provider:model to use",
    "google:gemini-2.0-flash",
  )
  .option(
    "--max-steps <number>",
    "Number of max steps for tool calling",
    (v) => parseInt(v, 10),
    10,
  )
  .option(
    "-e, --editor <cmd>",
    "Editor command",
    process.env.EDITOR || "vi +99999",
  )
  .option("-c, --cwd <path>", "Working directory for file tools", processCwd())
  .option("--no-tools", "Disable file tools (pure chat mode)")
  .parse(process.argv);

let opts = program.opts();
let chatFile = program.args[0];
if (!chatFile) {
  fatal("Missing required <chatFile> argument");
}

// Resolve paths
let resolvedChatPath = resolve(chatFile);
let cwd = resolve(opts.cwd);

// Read system prompt
let system: string | undefined;
if (opts.system) {
  let systemRes = await tryCatch(readFile(opts.system, "utf-8"));
  if (!systemRes.ok) {
    fatal(`Could not read system prompt file: ${opts.system}`);
  }
  system = systemRes.data;
}

// Instantiate model
let modelRes = tryCatch(() => registry.languageModel(opts.model));
if (!modelRes.ok) {
  fatal(modelRes.error.message);
}
let model = modelRes.data;

// Ensure chat file exists
if (!existsSync(resolvedChatPath)) {
  let writeRes = await tryCatch(
    writeFile(resolvedChatPath, "", { encoding: "utf-8" }),
  );
  if (!writeRes.ok) {
    fatal(`Could not create chat file: ${resolvedChatPath}`);
  }
}

// Build tools object only if not disabled
let toolsOption = opts.tools
  ? {
      listFiles: createListFilesTool({ cwd }),
      readFiles: createReadFilesTool({ cwd }),
      writeFiles: createWriteFilesTool({ cwd }),
      grepSearch: createGrepSearchTool({ cwd }),
    }
  : undefined;

let options: MarkdownAIOptions = {
  path: resolvedChatPath,
  editor: opts.editor,
  ai: {
    model,
    system,
    maxSteps: opts.maxSteps,
    ...(toolsOption ? { tools: toolsOption } : {}),
  },
};

let chat = new MarkdownAI(options);

intro("Markdown AI");
let res = await tryCatch(chat.run());
if (!res.ok) {
  log.error(res.error.message);
  process.exit(1);
}
outro("This was fun! See ya!");
process.exit(0);

#!/usr/bin/env node

import { cwd as processCwd } from "node:process";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { Command } from "commander";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { intro, log, outro } from "@clack/prompts";
import { createProviderRegistry } from "ai";

import { MarkdownAI } from "../chat/chat.js";
import { tryCatch } from "../utils/index.js";
import { createReadFilesTool } from "../tools/read-files.js";
import { createListFilesTool } from "../tools/list-files.js";
import { createWriteFilesTool } from "../tools/write-files.js";
import { createGrepSearchTool } from "../tools/grep-search.js";
import { createExecCommandTool } from "../tools/exec-command.js";
import { loadConfig } from "./config.js";

let registry = createProviderRegistry({ anthropic, openai, google });

function fatal(message: string, code = 1): never {
  console.error(`Error: ${message}`);
  process.exit(code);
}

let program = new Command()
  .name("md-ai")
  .description("Interactive Markdown-based AI agent")
  .argument("<chatFile>", "Path to the markdown file for the chat history.")
  .option("-s, --system <path>", "Path to a file containing a system prompt")
  .option(
    "-m, --model <provider:model>",
    "provider:model to use, defaults to google:gemini-2.0-flash",
  )
  .option(
    "-e, --editor <cmd>",
    "Editor command, defaults to $EDITOR or 'vi +9999'",
  )
  .option(
    "-c, --cwd <path>",
    "Working directory for file tools, defaults to current directory.",
    processCwd(),
  )
  .option(
    "--config <path>",
    "Custom config file directory. Default config path is '~/.config/md-ai/config.json'",
  )
  .option("--show-config", "Log final configuration")
  .option("--no-tools", "Disable tools (pure chat mode)")
  .option("--no-compression", "Disable compression for tool call/result fences")
  .parse(process.argv);

let chatPath = program.args[0];
if (!chatPath) {
  fatal("Missing required <chatFile> argument");
}
let readChatRes = await tryCatch(readFile(chatPath, "utf-8"));
let writeChatRes = await tryCatch(
  writeFile(chatPath, readChatRes.ok ? readChatRes.data : "", "utf-8"),
);
if (!writeChatRes.ok) {
  fatal(`Could not create chat file: ${chatPath}`);
}

intro("Hey! I'm Markdown AI 🫡");

let opts = program.opts();

let loadedConfig = await loadConfig(opts.config);

let config = {
  system: opts.system || loadedConfig.system,
  model: opts.model || loadedConfig.model || "google:gemini-2.0-flash",
  editor:
    opts.editor || loadedConfig.editor || process.env.EDITOR || "vi +99999",
  compression:
    opts.compression === true ? !loadedConfig.compression : opts.compression,
};

let system: string | undefined;
if (config.system) {
  let systemRes = await tryCatch(readFile(config.system, "utf-8"));
  if (!systemRes.ok) {
    fatal(`Could not read system prompt file: ${config.system}`);
  }
  system = systemRes.data;
}

let modelRes = tryCatch(() => registry.languageModel(config.model));
if (!modelRes.ok) {
  fatal(modelRes.error.message);
}
let model = modelRes.data;

let cwd = resolve(opts.cwd);
let execSession = { alwaysAllow: new Set<string>() };
let tools = opts.tools
  ? {
      listFiles: createListFilesTool({ cwd }),
      readFiles: createReadFilesTool({ cwd }),
      writeFiles: createWriteFilesTool({ cwd }),
      grepSearch: createGrepSearchTool({ cwd }),
      execCommand: createExecCommandTool({ cwd, session: execSession }),
    }
  : undefined;

let chat = new MarkdownAI({
  path: chatPath,
  editor: config.editor,
  ai: { model, system, tools },
  withCompression: config.compression,
});

if (opts.showConfig) {
  log.info(`Config:\n${JSON.stringify(config, null, 2)}`);
}

let res = await tryCatch(chat.run());

if (!res.ok) {
  log.error(res.error.message);
  outro("Something went wrong...");
} else {
  outro("Bye 👋");
}

process.exit(res.ok ? 0 : 1);

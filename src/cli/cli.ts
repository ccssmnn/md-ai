#!/usr/bin/env node

import { cwd as cwd_ } from "node:process";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import { Command } from "commander";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { intro, log, outro } from "@clack/prompts";
import { createProviderRegistry, type ToolSet } from "ai";

import { runMarkdownAI } from "../chat/chat.js";
import { tryCatch } from "../utils/index.js";

import { createReadFilesTool } from "../tools/read-files.js";
import { createListFilesTool } from "../tools/list-files.js";
import { createWriteFilesTool } from "../tools/write-files.js";
import { createGrepSearchTool } from "../tools/grep-search.js";
import { createExecCommandTool } from "../tools/exec-command.js";
import { createFetchUrlContentTool } from "../tools/fetch-url-content.js";

import { loadConfig, type MarkdownAIConfig } from "./config.js";

async function main() {
  let { program, chatPath } = parseCLIArguments();

  let loadedConfig = await loadConfig(program.opts().config);

  let config = mergeConfigs(program.opts(), loadedConfig);

  let options = await prepareOptions(config, program.opts(), chatPath);

  await startMarkdownAI(options);
}

function parseCLIArguments() {
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
      cwd_(),
    )
    .option(
      "--config <path>",
      "Custom config file directory. Default config path is '~/.config/md-ai/config.json'",
    )
    .option("--show-config", "Log final configuration")
    .option("--no-tools", "Disable tools (pure chat mode)")
    .option(
      "--no-compression",
      "Disable compression for tool call/result fences",
    )
    .parse(process.argv);

  let chatPath = program.args[0];
  if (!chatPath) {
    fatal("Missing required <chatFile> argument");
  }
  return { program, chatPath };
}

function mergeConfigs(opts: any, loadedConfig: MarkdownAIConfig) {
  let system = opts.system || loadedConfig.system;
  let model = opts.model || loadedConfig.model || "google:gemini-2.0-flash";
  let editor =
    opts.editor || loadedConfig.editor || process.env.EDITOR || "vi +99999";
  let compression =
    opts.compression === true ? !loadedConfig.compression : opts.compression;
  return { system, model, editor, compression };
}

async function prepareOptions(
  config: ReturnType<typeof mergeConfigs>,
  opts: any,
  chatPath: string,
) {
  await ensureChatFileExists(chatPath);

  let system = await loadSystemPrompt(config.system);
  let model = getModel(config.model);
  let cwd = resolve(opts.cwd);
  let tools = opts.tools ? createTools(cwd) : undefined;

  return {
    chatPath,
    config,
    system,
    model,
    tools,
    showConfig: opts.showConfig,
  };
}

async function ensureChatFileExists(chatPath: string) {
  let readChatRes = await tryCatch(readFile(chatPath, "utf-8"));
  let writeChatRes = await tryCatch(
    writeFile(chatPath, readChatRes.ok ? readChatRes.data : "", "utf-8"),
  );
  if (!writeChatRes.ok) {
    fatal(`Could not create chat file: ${chatPath}`);
  }
}

async function loadSystemPrompt(systemPath?: string) {
  if (!systemPath) return undefined;
  let systemRes = await tryCatch(readFile(systemPath, "utf-8"));
  if (!systemRes.ok) {
    fatal(`Could not read system prompt file: ${systemPath}`);
  }
  return systemRes.data;
}

function getModel(modelName: string) {
  let registry = createProviderRegistry({ anthropic, openai, google });
  let modelRes = tryCatch(() => registry.languageModel(modelName as any));
  if (!modelRes.ok) {
    fatal(modelRes.error.message);
  }
  return modelRes.data;
}

function createTools(cwd: string) {
  return {
    listFiles: createListFilesTool({ cwd }),
    readFiles: createReadFilesTool({ cwd }),
    writeFiles: createWriteFilesTool({ cwd }),
    grepSearch: createGrepSearchTool({ cwd }),
    execCommand: createExecCommandTool({ cwd, alwaysAllow: [] }),
    fetchUrlContent: createFetchUrlContentTool(),
  };
}

async function startMarkdownAI({
  chatPath,
  config,
  system,
  model,
  tools,
  showConfig,
}: {
  chatPath: string;
  config: ReturnType<typeof mergeConfigs>;
  system: string | undefined;
  model: any;
  tools: ToolSet | undefined;
  showConfig: boolean;
}) {
  intro("Hey! I'm Markdown AI 🫡");

  if (tools) {
    let toolList = Object.keys(tools)
      .map((t) => `- ${t}`)
      .join("\n");
    log.info(`Available tools:\n${toolList}`);
  }

  if (showConfig) {
    log.info(`Config:\n${JSON.stringify(config, null, 2)}`);
  }

  let res = await tryCatch(
    runMarkdownAI({
      path: chatPath,
      editor: config.editor,
      ai: { model, system, tools },
      withCompression: config.compression,
    }),
  );

  if (!res.ok) {
    log.error(res.error.message);
    outro("Something went wrong...");
  } else {
    outro("Bye 👋");
  }

  process.exit(res.ok ? 0 : 1);
}

function fatal(message: string, code = 1): never {
  console.error(`Error: ${message}`);
  process.exit(code);
}

main();

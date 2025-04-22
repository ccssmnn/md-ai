#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { argv, env } from "node:process";

import { google } from "@ai-sdk/google";

import { MarkdownAI, type MarkdownAIOptions } from "./chat.js";
import {
  createListFilesTool,
  createReadFilesTool,
  createWriteFilesTool,
} from "./tools.js";
import { intro, log, outro } from "@clack/prompts";
import { tryCatch } from "./utils.js";

function printUsage(): void {
  console.log(`
Usage: ./cli.js <chat_file_path> [--system=<system_prompt_path>] [-d]

let editor: string = "vi +99999";
  <chat_file_path>       Path to the markdown file for the chat history.
  --max-steps=<number>   Optional number of max steps for tool calling
  --system=<path>        Optional path to a file containing the system prompt.
  --editor=<command>     Optional editor command. Defaults to 'vi +99999'.
  -d                     Optional flag to set development mode.
`);
}

let defaultEditor = "vi +99999";
let editor = defaultEditor;
let path: string | undefined;
let system: string | undefined;
let maxSteps = 1;

for (let i = 2; i < argv.length; i++) {
  let arg = argv[i];
  if (!arg) continue;

  if (arg === "-d") {
    env.IS_DEV = "true";
  } else if (arg.startsWith("--system=")) {
    let [, path] = arg.split("=", 2);
    if (!path) {
      console.error("Error: --system requires a path");
      printUsage();
      process.exit(1);
    }
    try {
      system = readFileSync(path, { encoding: "utf-8" });
    } catch (error) {
      console.error(`Error: Could not read system prompt file: ${path}`);
      process.exit(1);
    }
  } else if (arg.startsWith("--editor=")) {
    let [, editorPath] = arg.split("=", 2);
    if (!editorPath) {
      console.error("Error: --editor requires a command");
      printUsage();
      process.exit(1);
    }
    editor = editorPath;
  } else if (arg.startsWith("--max-steps=")) {
    let [, n] = arg.split("=", 2);
    if (!n || Number(n) < 1) {
      console.error("Error: --max-steps requires a number >0");
      process.exit(1);
    }
    maxSteps = Number(n);
  } else if (!path) {
    path = arg;
  } else {
    printUsage();
    process.exit(1);
  }
}

if (editor === defaultEditor && process.env.EDITOR) {
  editor = process.env.EDITOR;
}

if (!path) {
  console.error("Error: Missing chat file path");
  printUsage();
  process.exit(1);
}

if (!existsSync(path)) {
  try {
    await writeFile(path, "", { encoding: "utf-8" });
  } catch (error) {
    console.error(`Error: Could not create chat file: ${path}`);
    process.exit(1);
  }
}

let options: MarkdownAIOptions = {
  path,
  editor,
  ai: {
    model: google("gemini-2.0-flash"),
    system,
    maxSteps,
    tools: {
      readFiles: createReadFilesTool(),
      listFiles: createListFilesTool(),
      writeFiles: createWriteFilesTool(),
    },
  },
};

let chat = new MarkdownAI(options);

intro("Markdown AI");
let res = await tryCatch(chat.run());
if (!res.ok) {
  log.error(res.error.message);
}
outro("This was fun! See ya!");

process.exit(0);

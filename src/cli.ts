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

function printUsage(): void {
  console.log(`
Usage: ./cli.js <chat_file_path> [--system=<system_prompt_path>] [-d]

  <chat_file_path>       Path to the markdown file for the chat history.
  --max-steps=<number>   Optional number of max steps for tool calling
  --system=<path>        Optional path to a file containing the system prompt.
  -d                     Optional flag to set development mode.
`);
}

let editor = "vi +99999";
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
    console.error(`Error: Unexpected argument: ${arg}`);
    printUsage();
    process.exit(1);
  }
}

if (process.env.EDITOR) {
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
    model: google("gemini-2.0-pro-exp-02-05"),
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

await chat.run();

process.exit(0);

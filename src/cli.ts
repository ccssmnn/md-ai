#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { argv, env } from "node:process";

import { google } from "@ai-sdk/google";

import { MarkdownChat } from "./chat.js";

function printUsage(): void {
  console.log(`
Usage: ./cli.js <chat_file_path> [--system=<system_prompt_path>] [-d]

  <chat_file_path>       Path to the markdown file for the chat history.
  --system=<path>        Optional path to a file containing the system prompt.
  -d                     Optional flag to set development mode.
`);
}

let chatPath: string | undefined;
let systemPrompt: string | undefined;

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
      systemPrompt = readFileSync(path, { encoding: "utf-8" });
    } catch (error) {
      console.error(`Error: Could not read system prompt file: ${path}`);
      process.exit(1);
    }
  } else if (!chatPath) {
    chatPath = arg;
  } else {
    console.error(`Error: Unexpected argument: ${arg}`);
    printUsage();
    process.exit(1);
  }
}

if (!chatPath) {
  console.error("Error: Missing chat file path");
  printUsage();
  process.exit(1);
}

if (!existsSync(chatPath)) {
  try {
    await writeFile(chatPath, "", { encoding: "utf-8" });
  } catch (error) {
    console.error(`Error: Could not create chat file: ${chatPath}`);
    process.exit(1);
  }
}

let chatOptions = {
  model: google("gemini-2.0-flash"),
  path: chatPath,
  systemPrompt,
};

let chatMachine = new MarkdownChat(chatOptions);

await chatMachine.run();

process.exit(0);

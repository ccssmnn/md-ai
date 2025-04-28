export { MarkdownAI } from "./chat.js";
export type { MarkdownAIOptions } from "./chat.js";

import { markdownToMessages } from "./markdown-parse.js";
import { messagesToMarkdown } from "./markdown-serialize.js";
import { openInEditor } from "./prompts.js";

export const utils = {
  openInEditor,
  markdownToMessages,
  messagesToMarkdown,
};

import { createListFilesTool } from "./tools/list-files.js";
import { createReadFilesTool } from "./tools/read-files.js";
import { createWriteFilesTool } from "./tools/write-files.js";
import { createGrepSearchTool } from "./tools/grep-search.js";

export const tools = {
  createWriteFilesTool,
  createReadFilesTool,
  createListFilesTool,
  createGrepSearchTool,
};

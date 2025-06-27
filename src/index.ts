export { runMarkdownAI } from "./chat/chat.js";
export type { MarkdownAIOptions } from "./chat/chat.js";

import { markdownToMessages } from "./markdown/parse.js";
import { messagesToMarkdown } from "./markdown/serialize.js";
import { openInEditor } from "./chat/editor.js";

export const utils = {
  openInEditor,
  markdownToMessages,
  messagesToMarkdown,
};

import { createListFilesTool } from "./tools/list-files.js";
import { createReadFilesTool } from "./tools/read-files.js";
import { createWriteFileTool } from "./tools/write-file.js";
import { createGrepSearchTool } from "./tools/grep-search.js";
import { createExecCommandTool } from "./tools/exec-command.js";
import { createFetchUrlContentTool } from "./tools/fetch-url-content.js";

export const tools = {
  createWriteFilesTool: createWriteFileTool,
  createReadFilesTool,
  createListFilesTool,
  createGrepSearchTool,
  createExecCommandTool,
  createFetchUrlContentTool,
};

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

export * as tools from "./tools.js";

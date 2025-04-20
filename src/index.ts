export { MarkdownAI } from "./chat.js";
export type { MarkdownAIOptions } from "./chat.js";

import { markdownToMessages } from "./markdown-parse.js";
import { messagesToMarkdown } from "./markdown-serialize.js";
import { askUser, openInEditor } from "./prompts.js";

export const utils = {
  askUser,
  openInEditor,
  markdownToMessages,
  messagesToMarkdown,
};

export * as tools from "./tools.js";

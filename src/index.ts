export { MarkdownChat, type MarkdownChatOptions } from "./chat.js";
import { markdownToMessages, messagesToMarkdown } from "./markdown.js";
import { askUser, openInEditor } from "./prompts.js";

export const utils = {
  askUser,
  openInEditor,
  markdownToMessages,
  messagesToMarkdown,
};

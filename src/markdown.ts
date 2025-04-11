import type { CoreMessage } from "ai";
import { shouldNeverHappen } from "./utils.js";

/**
 * Converts a markdown string to an array of chat messages
 * @param {string} markdown file as a string
 * @returns {Array<CoreMessage>}
 */
export function markdownToMessages(markdown: string): CoreMessage[] {
  let lines = markdown.split("\n");

  let messages: CoreMessage[] = [];

  let messageRole: CoreMessage["role"] | null = null;

  let messageLines: string[] = [];

  for (let line of lines) {
    let trimmed = line.trim().toLowerCase();
    let isUserHeading = trimmed === "## user";
    let isAssistantHeading = trimmed === "## assistant";
    let isNewMessage = isUserHeading || isAssistantHeading;

    if (isNewMessage && messageRole && messageLines.length > 0) {
      messages.push({
        role: messageRole,
        content: messageLines.join("\n").trim(),
      });
      messageLines = [];
    }

    if (isUserHeading) {
      messageRole = "user";
    } else if (isAssistantHeading) {
      messageRole = "assistant";
    } else if (messageRole) {
      messageLines.push(line);
    }
  }

  if (messageRole && messageLines.length > 0) {
    messages.push({
      role: messageRole,
      content: messageLines.join("\n").trim(),
    });
  }

  return messages;
}

/**
 * Converts an array of chat messages to a markdown string
 * @param {CoreMessage[]} messages
 * @returns {string}
 */
export function messagesToMarkdown(messages: CoreMessage[]): string {
  let markdown = "";

  for (let message of messages) {
    let heading = "";

    if (message.role === "user") {
      heading = "## User";
    } else if (message.role === "assistant") {
      heading = "## Assistant";
    } else {
      shouldNeverHappen(
        "currently only conversations between user and assistant is supported",
      );
    }

    markdown += heading + "\n\n";
    if (typeof message.content === "string") {
      markdown += message.content + "\n\n";
      continue;
    }

    message.content.forEach((part) => {
      if (part.type === "text") {
        markdown += part.text + "\n";
      } else {
        shouldNeverHappen("we currently only support text message parts");
      }
    });
  }

  return markdown.trim();
}

import { shouldNeverHappen } from "./utils.js";

/**
 * @param {string} markdown file as a string
 * @returns {Array<import("ai").CoreMessage>}
 */
export function markdownToMessages(markdown) {
  let lines = markdown.split("\n");

  /** @type {Array<import("ai").CoreMessage>} */
  let messages = [];

  /** @type {import("ai").CoreMessage["role"] | null} */
  let messageRole = null;

  /** @type {Array<string>} */
  let messageLines = [];

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
 * @param {import("ai").CoreMessage[]} messages
 * @returns {string}
 */
export function messagesToMarkdown(messages) {
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

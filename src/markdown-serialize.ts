import type {
  CoreAssistantMessage,
  ToolResultPart,
  CoreMessage,
  CoreUserMessage,
} from "ai";

import { shouldNeverHappen } from "./utils.js";

/**
 * Convert messages into markdown with compact JSON tool fences.
 */
export function messagesToMarkdown(messages: Array<CoreMessage>): string {
  let md = "";

  for (let msg of messages) {
    md += `## ${msg.role}\n\n`;

    if (msg.role === "system") {
      md += msg.content + "\n\n";
      continue;
    }

    if (msg.role === "user") {
      md += serializeUserParts(msg.content) + "\n\n";
      continue;
    }

    if (msg.role === "assistant") {
      md += serializeAssistantParts(msg.content) + "\n\n";
      continue;
    }

    if (msg.role === "tool") {
      md += serializeToolResultParts(msg.content) + "\n\n";
      continue;
    }

    msg satisfies never;
    shouldNeverHappen(`unexpected message: ${msg}`);
  }

  return md.trimEnd() + "\n";
}

function serializeUserParts(parts: CoreUserMessage["content"]) {
  if (typeof parts === "string") {
    return parts;
  }
  let out = "";

  parts.forEach((p, i) => {
    if (p.type === "text") {
      out += p.text;
    } else {
      shouldNeverHappen(`unsupported user message content part type ${p.type}`);
    }
    // Add a blank line after each part except the last one.
    if (i < parts.length - 1) {
      out += "\n\n";
    }
  });
  return out;
}

function serializeAssistantParts(
  parts: CoreAssistantMessage["content"],
): string {
  if (typeof parts === "string") {
    return parts;
  }
  let out = "";
  parts.forEach((p, i) => {
    if (p.type === "text") {
      out += p.text;
    } else if (p.type === "tool-call") {
      let payload = {
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        args: p.args,
      };
      let json = JSON.stringify(payload);
      out += fence("tool-call", json);
    } else {
      shouldNeverHappen(
        `unsupported assistent message content part type ${p.type}`,
      );
    }
    // Add a blank line after each part except the last one.
    if (i < parts.length - 1) {
      out += "\n\n";
    }
  });
  return out;
}

function serializeToolResultParts(parts: Array<ToolResultPart>): string {
  let out = "";
  for (let p of parts) {
    let payload = {
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      result: p.result,
    };
    let json = JSON.stringify(payload);
    out += fence("tool-result", json);
  }
  return out;
}

function fence(name: string, content: string): string {
  return `
${"```"}${name}
${content}
${"```"}
`;
}

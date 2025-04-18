import type { CoreAssistantMessage, ToolResultPart, CoreMessage } from "ai";
import { shouldNeverHappen } from "./utils.js";

/**
 * Convert messages into markdown with compact JSON tool fences.
 */
export function messagesToMarkdown(messages: Array<CoreMessage>): string {
  let md = "";

  for (const msg of messages) {
    md += `## ${msg.role}\n\n`;

    switch (msg.role) {
      case "system":
        md += `${msg.content}\n\n`;
        break;

      case "user":
        if (typeof msg.content === "string") {
          md += `${msg.content}\n\n`;
        } else {
          shouldNeverHappen(
            "file and image parts of the user message cannot be serialized yet",
          );
        }
        break;

      case "assistant":
        md +=
          typeof msg.content === "string"
            ? msg.content
            : serializeAssistantParts(msg.content) + "\n\n";
        break;

      case "tool":
        md += serializeToolResultParts(msg.content) + "\n\n";
        break;

      default:
        shouldNeverHappen(`unknown role: ${msg}`);
    }
  }

  return md.trimEnd() + "\n";
}

function serializeAssistantParts(
  parts: Exclude<CoreAssistantMessage["content"], string>,
): string {
  let out = "";
  for (const p of parts) {
    if (p.type === "text") {
      out += p.text;
    } else if (p.type === "tool-call") {
      const payload = {
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        args: p.args,
      };
      const json = JSON.stringify(payload);
      out += `\n${fence("tool-call", json)}`;
    } else {
      shouldNeverHappen(`unsupported part type ${p.type}`);
    }
  }
  return out;
}

function serializeToolResultParts(parts: Array<ToolResultPart>): string {
  let out = "";
  for (const p of parts) {
    const payload = {
      toolCallId: p.toolCallId,
      toolName: p.toolName,
      result: p.result,
    };
    const json = JSON.stringify(payload);
    out += `${fence("tool-result", json)}`;
  }
  return out;
}

function fence(name: string, content: string): string {
  return `\`\`\`${name}\n${content}\n\`\`\``;
}

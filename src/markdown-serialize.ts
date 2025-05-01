import type { CoreAssistantMessage, ToolResultPart, CoreMessage } from "ai";
import { shouldNeverHappen } from "./utils.js";

/**
 * Convert messages into markdown with compact JSON tool fences.
 */
export function messagesToMarkdown(messages: Array<CoreMessage>): string {
  let md = "";

  for (let msg of messages) {
    md += `## ${msg.role}\n\n`;

    if (msg.role === "system") {
      md += `${msg.content}\n\n`;
      continue;
    }

    if (msg.role === "user") {
      if (typeof msg.content === "string") {
        md += `${msg.content}\n\n`;
      } else {
        for (let part of msg.content) {
          if (part.type !== "text") {
            shouldNeverHappen(
              `file and image parts of the user message cannot be serialized yet. got message: ${JSON.stringify(msg)}`,
            );
          }
          md += `${part.text}\n\n`;
        }
      }
      continue;
    }

    if (msg.role === "assistant") {
      if (typeof msg.content === "string") {
        md += msg.content;
      } else {
        md += serializeAssistantParts(msg.content) + "\n\n";
      }
      continue;
    }

    if (msg.role === "tool") {
      md += serializeToolResultParts(msg.content) + "\n\n";
      continue;
    }

    shouldNeverHappen(`unexpected message: ${msg}`);
  }

  return md.trimEnd() + "\n";
}

function serializeAssistantParts(
  parts: Exclude<CoreAssistantMessage["content"], string>,
): string {
  let out = "";
  for (let p of parts) {
    if (p.type === "text") {
      out += p.text;
    } else if (p.type === "tool-call") {
      let payload = {
        toolCallId: p.toolCallId,
        toolName: p.toolName,
        args: p.args,
      };
      let json = JSON.stringify(payload);
      out += `\n${fence("tool-call", json)}`;
    } else {
      shouldNeverHappen(`unsupported part type ${p.type}`);
    }
  }
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
    out += `\n${fence("tool-result", json)}`;
  }
  return out;
}

function fence(name: string, content: string): string {
  return `\`\`\`${name}\n${content}\n\`\`\``;
}

import type {
  CoreAssistantMessage,
  ToolResultPart,
  CoreMessage,
  CoreUserMessage,
} from "ai";

import { shouldNeverHappen } from "../utils/index.js";
import { brotliCompressSync } from "node:zlib";
import { Buffer } from "node:buffer";

/**
 * Convert messages into markdown with compact JSON tool fences.
 * Optionally compress tool call and tool result fences using Brotli.
 */
export function messagesToMarkdown(
  messages: Array<CoreMessage>,
  compressed: boolean = true,
): string {
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
      md += serializeAssistantParts(msg.content, compressed) + "\n\n";
      continue;
    }

    if (msg.role === "tool") {
      md += serializeToolResultParts(msg.content, compressed) + "\n\n";
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
  compressed: boolean,
): string {
  if (typeof parts === "string") {
    return parts;
  }
  let out = "";
  parts.forEach((p, i) => {
    if (p.type === "text") {
      out += p.text;
    } else if (p.type === "tool-call") {
      let payload: any = {
        toolCallId: p.toolCallId,
        toolName: p.toolName,
      };
      if (compressed) {
        const argsJson = JSON.stringify(p.args);
        const compressedArgs = brotliCompressSync(
          Buffer.from(argsJson, "utf-8"),
        );
        payload.compressedArgs = compressedArgs.toString("base64");
        out += fence("tool-call-compressed", JSON.stringify(payload));
      } else {
        payload.args = p.args;
        out += fence("tool-call", JSON.stringify(payload));
      }
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

function serializeToolResultParts(
  parts: Array<ToolResultPart>,
  compressed: boolean,
): string {
  let out = "";
  for (let p of parts) {
    let payload: any = {
      toolCallId: p.toolCallId,
      toolName: p.toolName,
    };
    if (compressed) {
      const resultJson = JSON.stringify(p.result);
      const compressedResult = brotliCompressSync(
        Buffer.from(resultJson, "utf-8"),
      );
      payload.compressedResult = compressedResult.toString("base64");
      out += fence("tool-result-compressed", JSON.stringify(payload));
    } else {
      payload.result = p.result;
      out += fence("tool-result", JSON.stringify(payload));
    }
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

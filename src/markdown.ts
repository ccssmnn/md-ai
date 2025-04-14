import type {
  CoreSystemMessage,
  CoreUserMessage,
  CoreAssistantMessage,
  CoreToolMessage,
  TextPart,
  ImagePart,
  FilePart,
  ToolResultPart,
  CoreMessage,
} from "ai";

import { shouldNeverHappen, tryCatch } from "./utils.js";

/**
 * Overall parse:
 * 1) Split into role-labeled blocks
 * 2) For each block, parse content based on the role
 */
export function markdownToMessages(md: string): Array<CoreMessage> {
  let blocks = splitMarkdown(md);
  return blocks.map(({ role, text }) => {
    if (role === "system") {
      return {
        role,
        content: parseSystemContent(text),
      } satisfies CoreSystemMessage;
    } else if (role === "user") {
      return {
        role,
        content: parseUserContent(text),
      } satisfies CoreUserMessage;
    } else if (role === "assistant") {
      return {
        role,
        content: parseAssistantContent(text),
      } satisfies CoreAssistantMessage;
    } else if (role === "tool") {
      return {
        role,
        content: parseToolContent(text),
      };
    } else {
      shouldNeverHappen(`unexpected message role '${role}'`);
    }
  });
}

/**
 * Overall serialize:
 * 1) For each message, print heading based on role
 * 2) Convert content with a role-specific helper
 */
export function messagesToMarkdown(messages: Array<CoreMessage>): string {
  let md = "";

  for (let msg of messages) {
    md += `## ${msg.role}\n\n`;
    if (msg.role === "system") {
      md += serializeSystem(msg.content) + "\n\n";
    } else if (msg.role === "user") {
      md += serializeUser(msg.content) + "\n\n";
    } else if (msg.role === "assistant") {
      md += serializeAssistant(msg.content) + "\n\n";
    } else {
      md += serializeTool(msg.content) + "\n\n";
    }
  }
  return md.trimEnd() + "\n";
}

type MarkdownBlock = {
  role: CoreMessage["role"];
  text: string;
};

/**
 * Given a full Markdown, split into role-labeled blocks
 * (## system, ## user, etc.).
 */
function splitMarkdown(markdown: string): Array<MarkdownBlock> {
  let lines = markdown.split("\n");
  let blocks: Array<MarkdownBlock> = [];

  let currentRole: CoreMessage["role"] | null = null;
  let buffer: Array<string> = [];

  for (let line of lines) {
    let trimmed = line.trim().toLowerCase();
    if (!trimmed) continue;

    let matchedRole: CoreMessage["role"] | null = null;

    if (trimmed === "## system") matchedRole = "system";
    else if (trimmed === "## user") matchedRole = "user";
    else if (trimmed === "## assistant") matchedRole = "assistant";
    else if (trimmed === "## tool") matchedRole = "tool";

    if (matchedRole) {
      if (currentRole && buffer.length) {
        blocks.push({ role: currentRole, text: buffer.join("\n") });
        buffer = [];
      }
      currentRole = matchedRole;
      continue;
    }
    buffer.push(line);
  }

  if (currentRole) {
    blocks.push({ role: currentRole, text: buffer.join("\n") });
  }

  return blocks;
}

function parseSystemContent(text: string): string {
  return text.trim();
}

function parseUserContent(text: string): CoreUserMessage["content"] {
  if (!text.includes("[file](") && !text.includes("[image](")) {
    return text.trim();
  }

  // otherwise parse into an array
  return parseInlineFilesAndImages(text);
}

function parseAssistantContent(text: string): CoreAssistantMessage["content"] {
  // If you find no special tokens, just return text
  if (!text.includes("```reasoning") && !text.includes("```tool-call")) {
    return text.trim();
  }

  return parseAssistantParts(text);
}

function parseToolContent(text: string): CoreToolMessage["content"] {
  return parseToolResultParts(text);
}

function serializeSystem(content: string): string {
  return content;
}

function serializeUser(content: CoreUserMessage["content"]): string {
  if (typeof content === "string") return content;
  // else it's an array of text/file/image
  return serializeInlineFilesAndImages(content);
}

function serializeAssistant(content: CoreAssistantMessage["content"]): string {
  if (typeof content === "string") return content;
  // else array: text|tool-call
  return serializeAssistantParts(content);
}

function serializeTool(content: CoreToolMessage["content"]): string {
  return serializeToolResultParts(content);
}

function parseInlineFilesAndImages(
  text: string,
): Array<TextPart | ImagePart | FilePart> {
  // Simple function to parse Markdown with [file] and [image] links
  const parts: Array<TextPart | ImagePart | FilePart> = [];

  // Match [file](...) or [image](...) pattern
  const regex = /\[(file|image)\]\(([^)]+)\)/g;

  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        text: text.substring(lastIndex, match.index),
      });
    }

    // Process the match
    const type = match[1] || "file"; // Default to file if undefined (shouldn't happen)
    const path = match[2] || ""; // Default to empty string if undefined

    if (type === "file") {
      parts.push({
        type: "file",
        data: path as string, // Type assertion to satisfy TypeScript
        mimeType: "",
      });
    } else {
      parts.push({
        type: "image",
        image: path as string, // Type assertion to satisfy TypeScript
      });
    }

    lastIndex = regex.lastIndex;
  }

  // Add any remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      text: text.substring(lastIndex),
    });
  }

  return parts;
}

function serializeInlineFilesAndImages(
  parts: Array<TextPart | ImagePart | FilePart>,
): string {
  return parts
    .map((p) => {
      if (p.type === "text") return p.text;
      if (p.type === "file") return `[file](${p.data})`;
      if (p.type === "image") return `[image](${p.image})`;

      return "";
    })
    .join("");
}

function parseAssistantParts(
  text: string,
): Exclude<CoreAssistantMessage["content"], string> {
  let parts: Exclude<CoreAssistantMessage["content"], string> = [];

  let fencePattern = /```tool-call\s*([\s\S]*?)```/gm;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(text)) !== null) {
    let preText = text.slice(lastIndex, match.index);
    if (preText) parts.push({ type: "text", text: preText });

    let fenceContent = match[2]?.trim();
    if (!fenceContent) continue;

    try {
      let json = JSON.parse(fenceContent);
      parts.push({
        type: "tool-call",
        toolCallId: String(json.toolCallId ?? ""),
        toolName: String(json.toolName ?? ""),
        args: json.args ?? {},
      });
    } catch {
      parts.push({ type: "text", text: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  // leftover
  let remainder = text.slice(lastIndex);
  if (remainder) parts.push({ type: "text", text: remainder });
  return parts;
}

function serializeAssistantParts(
  parts: Exclude<CoreAssistantMessage["content"], string>,
): string {
  let out = "";
  for (let p of parts) {
    if (p.type === "text") {
      out += p.text;
    } else if (p.type === "tool-call") {
      let json = JSON.stringify(
        {
          toolCallId: p.toolCallId,
          toolName: p.toolName,
          args: p.args,
        },
        null,
        2,
      );
      out += "\n" + fence("tool-call", json);
    } else {
      shouldNeverHappen(
        `Part type ${p.type} not supported yet. sorry :(`,
        p.type,
      );
    }
  }
  return out;
}

function parseToolResultParts(text: string): Array<ToolResultPart> {
  let results: Array<ToolResultPart> = [];
  let pattern = /```tool-result\s*([\s\S]*?)```/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    let content = match[1]?.trim();
    if (!content) continue;
    let res = tryCatch(() => JSON.parse(content));
    if (!res.ok) continue;
    let json = res.data;
    let part: ToolResultPart = {
      type: "tool-result",
      ...json,
    };
    results.push(part);
  }
  return results;
}

function serializeToolResultParts(parts: Array<ToolResultPart>): string {
  let out = "";
  for (let p of parts) {
    let { type, ...content } = p;
    let json = JSON.stringify(content, null, 2);
    out += fence("tool-result", json);
  }
  return out;
}

function fence(name: string, content: string): string {
  return `\`\`\`${name}\n${content}\n\`\`\``;
}

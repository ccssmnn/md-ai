import { unified } from "unified";
import remarkParse from "remark-parse";
import { z } from "zod";
import type { Root, Paragraph, PhrasingContent, Node, Code } from "mdast";
import type { CoreMessage, TextPart, ToolCallPart, ToolResultPart } from "ai";
import { brotliDecompressSync } from "node:zlib";
import { Buffer } from "node:buffer";

/**
 * transforms a markdown string into a list of CoreMessage that can be passed into the ai sdk
 * @throws if a tool-call or tool-result code fence does not match the schema or would be assigned to an invalid message role
 */
export function markdownToMessages(markdown: string): CoreMessage[] {
  let tree = unified().use(remarkParse).parse(markdown) as Root;
  let sections: Array<{ role: Role; parts: ContentPart[] }> = [];
  let current: { role: Role; parts: ContentPart[] } | null = null;

  tree.children.forEach((node) => {
    if (node.type === "heading" && node.depth === 2) {
      let role = checkRoleHeading(node.children[0]);
      if (role) {
        current = { role, parts: [] };
        sections.push(current);
      }
      return;
    }

    if (!current) {
      return;
    }

    let parts: ContentPart[] = [];
    if (node.type === "code") {
      parts = processCodeNode(node, markdown);
    } else if (node.type === "paragraph") {
      parts = processParagraphNode(node, markdown);
    } else {
      parts = processOtherNode(node, markdown);
    }

    if (parts.length > 0) {
      current.parts.push(...parts);
    }
  });

  return sections.map(({ role, parts }) => {
    let content: string | ContentPart[];
    if (parts.length === 0) {
      content = "";
    } else if (parts.length === 1 && parts[0] && parts[0].type === "text") {
      content = parts[0].text;
    } else {
      content = parts;
    }
    return { role, content } as CoreMessage;
  });
}

function processCodeNode(node: Code, markdown: string): ContentPart[] {
  let start = node.position?.start.offset;
  let end = node.position?.end.offset;
  let raw = start != null && end != null ? markdown.slice(start, end) : "";

  if (node.lang === "tool-call") {
    let data = toolCallSchema.parse(JSON.parse(node.value));
    return [{ type: "tool-call", ...data }];
  }
  if (node.lang === "tool-call-compressed") {
    try {
      const parsed = JSON.parse(node.value);
      const compressedArgsBuffer = Buffer.from(parsed.compressedArgs, "base64");
      const argsJson =
        brotliDecompressSync(compressedArgsBuffer).toString("utf-8");
      const args = JSON.parse(argsJson);
      const data = toolCallSchema.parse({
        toolCallId: parsed.toolCallId,
        toolName: parsed.toolName,
        args: args,
      });
      return [{ type: "tool-call", ...data }];
    } catch (e) {
      console.error(
        "Failed to decompress or parse tool-call-compressed data:",
        e,
      );
      // Fallback to treating as text if decompression/parsing fails
      return [{ type: "text", text: raw }];
    }
  }
  if (node.lang === "tool-result") {
    let data = toolResultSchema.parse(JSON.parse(node.value));
    return [{ type: "tool-result", ...data }];
  }
  if (node.lang === "tool-result-compressed") {
    try {
      const parsed = JSON.parse(node.value);
      const compressedResultBuffer = Buffer.from(
        parsed.compressedResult,
        "base64",
      );
      const resultJson = brotliDecompressSync(compressedResultBuffer).toString(
        "utf-8",
      );
      const result = JSON.parse(resultJson);
      const data = toolResultSchema.parse({
        toolCallId: parsed.toolCallId,
        toolName: parsed.toolName,
        result: result,
      });
      return [{ type: "tool-result", ...data }];
    } catch (e) {
      console.error(
        "Failed to decompress or parse tool-result-compressed data:",
        e,
      );
      // Fallback to treating as text if decompression/parsing fails
      return [{ type: "text", text: raw }];
    }
  }
  return [{ type: "text", text: raw }];
}

function processParagraphNode(
  node: Paragraph,
  markdown: string,
): ContentPart[] {
  let start = node.position?.start.offset;
  let end = node.position?.end.offset;
  let raw = start != null && end != null ? markdown.slice(start, end) : "";
  return [{ type: "text", text: raw }];
}

function processOtherNode(node: Node, markdown: string): ContentPart[] {
  let start = node.position?.start.offset;
  let end = node.position?.end.offset;
  let raw = start != null && end != null ? markdown.slice(start, end) : "";
  return [{ type: "text", text: raw }];
}

let toolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.any()),
});

let toolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.record(z.any()),
});

type ContentPart = TextPart | ToolCallPart | ToolResultPart;

let VALID_ROLES = ["user", "assistant", "tool", "system"] as const;
type Role = (typeof VALID_ROLES)[number];

function checkRoleHeading(node?: PhrasingContent): Role | null {
  if (!node) return null;
  if (node.type !== "text") return null;
  let value = node.value.trim().toLocaleLowerCase();
  if (!VALID_ROLES.includes(value as any)) {
    return null;
  }
  return value as Role;
}

import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Root, Paragraph, PhrasingContent } from "mdast";
import { z } from "zod";
import type { CoreMessage, TextPart, ToolCallPart, ToolResultPart } from "ai";

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
        return;
      }
    }

    if (!current) return;

    if (node.type === "code") {
      let start = node.position?.start.offset;
      let end = node.position?.end.offset;
      let raw = start != null && end != null ? markdown.slice(start, end) : "";
      if (node.lang === "tool-call") {
        if (current.role !== "assistant") {
          throw new Error("Tool calls are only allowed in assistant messages");
        }
        let data = toolCallSchema.parse(JSON.parse(node.value));
        current.parts.push({ type: "tool-call", ...data });
      } else if (node.lang === "tool-result") {
        if (current.role !== "tool") {
          throw new Error("Tool results are only allowed in tool messages");
        }
        let data = toolResultSchema.parse(JSON.parse(node.value));
        current.parts.push({ type: "tool-result", ...data });
      } else {
        current.parts.push({ type: "text", text: raw });
      }
      return;
    }

    if (node.type === "paragraph") {
      let para = node as Paragraph;
      let txt = para.children
        .map((c) => {
          if (!("value" in c)) return "";
          return c.value;
        })
        .join("");
      current.parts.push({ type: "text", text: txt + "\n" });
      return;
    }

    let start = node.position?.start.offset;
    let end = node.position?.end.offset;
    let raw = start != null && end != null ? markdown.slice(start, end) : "";
    current.parts.push({ type: "text", text: raw });
  });

  return sections.map(({ role, parts }) => {
    let content: string | ContentPart[];
    if (parts.length === 0) {
      content = "";
    } else if (parts.length === 1 && parts[0] && parts[0].type === "text") {
      content = parts[0].text.replace(/\n$/, "");
    } else {
      content = parts;
    }
    return { role, content } as CoreMessage;
  });
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

let VALID_ROLES = ["user", "assistant", "tool"] as const;
type Role = (typeof VALID_ROLES)[number];
function checkRoleHeading(node?: PhrasingContent): Role | null {
  if (!node) return null;
  if (node.type !== "text") return null;
  if (!VALID_ROLES.includes(node.value.trim().toLowerCase() as any))
    return null;
  return node.value.trim().toLowerCase() as Role;
}

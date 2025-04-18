import { unified } from "unified";
import remarkParse from "remark-parse";
import type { Heading } from "mdast";
import { z } from "zod";
import type { CoreMessage } from "ai";

const VALID_ROLES = ["user", "assistant", "tool"] as const;

type Role = (typeof VALID_ROLES)[number];

const ToolCallSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  args: z.record(z.any()),
});

const ToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  result: z.record(z.any()),
});

type TextPart = { type: "text"; text: string };
type ToolCallPart = { type: "tool-call" } & z.infer<typeof ToolCallSchema>;
type ToolResultPart = { type: "tool-result" } & z.infer<
  typeof ToolResultSchema
>;
type ContentPart = TextPart | ToolCallPart | ToolResultPart;
type MessageContent = string | ContentPart[];

function isRoleHeading(node: Heading): node is Heading {
  const first = node.children[0];
  if (!first || first.type !== "text") return false;
  return VALID_ROLES.includes(first.value.trim().toLowerCase() as Role);
}

export function markdownToMessages(markdown: string): CoreMessage[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const messages: CoreMessage[] = [];
  const nodes = tree.children;
  let i = 0;

  while (i < nodes.length) {
    const node = nodes[i]!;
    if (node.type === "heading" && node.depth === 2 && isRoleHeading(node)) {
      const heading = node;
      const roleText = (heading.children[0] as any).value.trim().toLowerCase();
      let role = roleText;
      const parts: ContentPart[] = [];
      i++;

      while (i < nodes.length) {
        const child = nodes[i]!;
        if (
          child.type === "heading" &&
          child.depth === 2 &&
          isRoleHeading(child)
        )
          break;

        if (child.type === "heading") {
          const start = child.position?.start.offset;
          const end = child.position?.end.offset;
          const raw =
            start != null && end != null ? markdown.slice(start, end) : "";
          parts.push({ type: "text", text: raw });
          i++;
          continue;
        }

        if (child.type === "code") {
          const code = child;
          // raw markdown of fence
          const start = child.position?.start.offset;
          const end = child.position?.end.offset;
          const raw =
            start != null && end != null ? markdown.slice(start, end) : "";
          if (code.lang === "tool-call") {
            if (role !== "assistant") {
              throw new Error(
                "Tool calls are only allowed in assistant messages",
              );
            }
            const data = ToolCallSchema.parse(JSON.parse(code.value));
            parts.push({ type: "tool-call", ...data });
          } else if (code.lang === "tool-result") {
            if (role !== "tool") {
              throw new Error("Tool results are only allowed in tool messages");
            }
            const data = ToolResultSchema.parse(JSON.parse(code.value));
            parts.push({ type: "tool-result", ...data });
          } else {
            parts.push({ type: "text", text: raw });
          }
        } else if (child.type === "paragraph") {
          const para = child;
          const text = para.children
            .map((c) => ((c as any).value as string) ?? "")
            .join("");
          parts.push({ type: "text", text: text + "\n" });
        } else {
          const start = child.position?.start.offset;
          const end = child.position?.end.offset;
          const raw =
            start != null && end != null ? markdown.slice(start, end) : "";
          parts.push({ type: "text", text: raw });
        }

        i++;
      }

      const count = parts.length;
      let content: MessageContent;
      if (count === 0) {
        content = "";
      } else {
        const only = parts[0]!;
        if (count === 1 && only.type === "text") {
          content = only.text.replace(/\n$/, "");
        } else {
          content = parts;
        }
      }
      messages.push({ role, content } as CoreMessage);
    } else {
      i++;
    }
  }

  return messages;
}

import type { CoreMessage } from "ai";
import test from "node:test";
import assert from "node:assert";
import { markdownToMessages } from "./markdown-parse.js";

test("markdownToMessages", async (t) => {
  await t.test("should ignore content before the first heading", () => {
    let markdown = "This content should be ignored.\n\n## user\nHello.";
    let expectedMessages: CoreMessage[] = [{ role: "user", content: "Hello." }];
    let parsedMessages = markdownToMessages(markdown);
    assert.deepStrictEqual(parsedMessages, expectedMessages);
  });

  await t.test("should treat incorrect heading levels as text", () => {
    let markdown =
      "## user\n# Not a role heading\n### Also not a role heading\nHello.";
    let expectedMessages: CoreMessage[] = [
      {
        role: "user",
        content: [
          {
            text: "# Not a role heading",
            type: "text",
          },
          {
            text: "### Also not a role heading",
            type: "text",
          },
          {
            text: "Hello.",
            type: "text",
          },
        ],
      },
    ];
    let parsedMessages = markdownToMessages(markdown);
    assert.deepStrictEqual(parsedMessages, expectedMessages);
  });

  await t.test("should throw error for malformed tool-call JSON", () => {
    let markdown =
      '## assistant\n```tool-call\n{"toolCallId": "call_123", "toolName": "list", "args": "invalid json"}\n```';
    assert.throws(
      () => markdownToMessages(markdown),
      /Expected object, received string/,
    );
  });

  await t.test("should throw error for malformed tool-result JSON", () => {
    let markdown =
      '## tool\n```tool-result\n{"toolCallId": "call_123", "toolName": "list", "result": "invalid json"}\n```';
    assert.throws(
      () => markdownToMessages(markdown),
      /Expected object, received string/,
    );
  });

  await t.test("should treat list items as text", () => {
    let markdown = "## user\n* Item 1\n* Item 2";
    let expectedMessages: CoreMessage[] = [
      { role: "user", content: "* Item 1\n* Item 2" },
    ];
    let parsedMessages = markdownToMessages(markdown);
    assert.deepStrictEqual(parsedMessages, expectedMessages);
  });

  await t.test("should treat blockquotes as text", () => {
    let markdown = "## user\n> This is a blockquote.";
    let expectedMessages: CoreMessage[] = [
      { role: "user", content: "> This is a blockquote." },
    ];
    let parsedMessages = markdownToMessages(markdown);
    assert.deepStrictEqual(parsedMessages, expectedMessages);
  });
});

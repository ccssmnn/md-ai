import { test } from "node:test";
import { strict as assert } from "node:assert";

import type { CoreMessage } from "ai";

import { markdownToMessages } from "./markdown-parse.js";
import { messagesToMarkdown } from "./markdown-serialize.js";

test("roundtrip markdown serialization and parsing", async (t) => {
  let testCases: Array<{ name: string; messages: CoreMessage[] }> = [
    {
      name: "Simple user and assistant messages",
      messages: [
        { role: "user", content: "Hello, world!" },
        { role: "assistant", content: "Hi there!" },
      ],
    },
    {
      name: "Assistant message with tool call",
      messages: [
        { role: "user", content: "Please list the files." },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Okay, I can do that." },
            {
              type: "tool-call",
              toolCallId: "call_abc",
              toolName: "listFiles",
              args: { patterns: ["src/"] },
            },
          ],
        },
      ],
    },
    {
      name: "Tool message with tool result",
      messages: [
        { role: "assistant", content: "Listing files..." },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_abc",
              toolName: "listFiles",
              result: { files: ["file1.txt", "file2.txt"] },
            },
          ],
        },
      ],
    },
    {
      name: "Mixed content in assistant message",
      messages: [
        { role: "user", content: "Tell me a joke and list files." },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "Why did the scarecrow win an award? Because he was outstanding in his field!",
            },
            {
              type: "tool-call",
              toolCallId: "call_def",
              toolName: "listFiles",
              args: { patterns: ["*.md"] },
            },
            { type: "text", text: "Here are the markdown files:" },
          ],
        },
      ],
    },
    {
      name: "System message",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" },
      ],
    },
    {
      name: "Empty content",
      messages: [
        { role: "user", content: "" },
        { role: "assistant", content: "" },
      ],
    },
    {
      name: "Kitchen Sink",
      messages: [
        { role: "system", content: "You are a versatile AI assistant." },
        {
          role: "user",
          content:
            "Can you tell me about the project structure and then list files in src/?\nAlso, what is 2 + 2?",
        },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Okay, I can help with that." },
            {
              type: "text",
              text: "The project has a standard structure with source files in `src/` and tests in `src/` as well.",
            },
            {
              type: "tool-call",
              toolCallId: "call_kitchen_sink_1",
              toolName: "listFiles",
              args: { patterns: ["src/"] },
            },
            { type: "text", text: "Regarding your math question:" },
            { type: "text", text: "```javascript\nconsole.log(2 + 2);\n```" },
            { type: "text", text: "The answer is 4." },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call_kitchen_sink_1",
              toolName: "listFiles",
              result: { files: ["src/index.ts", "src/cli.ts", "src/utils.ts"] },
            },
          ],
        },
        {
          role: "assistant",
          content: "I hope this helps!",
        },
      ],
    },
  ];

  for (let { name, messages } of testCases) {
    await t.test(name, () => {
      let markdown = messagesToMarkdown(messages);
      let parsedMessages = markdownToMessages(markdown);
      assert.deepStrictEqual(parsedMessages, messages);
    });
  }
});

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { markdownToMessages, messagesToMarkdown } from "./markdown.js"; // Adjust if your file name is different
import type { CoreMessage } from "ai";

test("markdownToMessages: minimal example", () => {
  let markdown = `
## user

Hello World!

## assistant

Hello User!
`;
  let messages = markdownToMessages(markdown);

  let expectedResult: typeof messages = [
    { role: "user", content: "Hello World!" },
    { role: "assistant", content: "Hello User!" },
  ];

  assert.deepEqual(messages, expectedResult);
});

test("markdownToMessages: empty user message", () => {
  let markdown = `
## user

`;
  let messages = markdownToMessages(markdown);
  let expectedResult: CoreMessage[] = [{ role: "user", content: "" }];
  assert.deepEqual(messages, expectedResult);
});

test("markdownToMessages: with file", () => {
  let markdown = `
## user

Check this file [file](path/to/file.txt)

## assistant

thanks!
`;
  let messages = markdownToMessages(markdown);

  let expectedResult: typeof messages = [
    {
      role: "user",
      content: [
        { type: "text", text: "Check this file " },
        { type: "file", data: "path/to/file.txt", mimeType: "" },
      ],
    },
    { role: "assistant", content: "thanks!" },
  ];
  assert.deepEqual(messages, expectedResult);
});

test("markdownToMessages: with tool call and response", () => {
  let markdown = `
## user

call the tool for me

## assistant

will do!

\`\`\`tool-call
{
  "toolCallId": "1234",
  "toolName": "myTool",
  "args": {
    "msg": "hello tool"
  }
}
\`\`\`

## tool


\`\`\`tool-result
{
  "toolCallId": "1234",
  "toolName": "myTool",
  "result": {
    "response": "hello agent"
  }
}
\`\`\`
`;
  let messages = markdownToMessages(markdown);

  let expectedResult: typeof messages = [
    {
      role: "user",
      content: "call the tool for me",
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "will do!\n" },
        {
          type: "tool-call",
          toolCallId: "1234",
          toolName: "myTool",
          args: { msg: "hello tool" },
        },
      ],
    },

    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "1234",
          toolName: "myTool",
          result: { response: "hello agent" },
        },
      ],
    },
  ];
  assert.deepEqual(messages, expectedResult);
});

test("messagesToMarkdown: minimal example", () => {
  let messages: CoreMessage[] = [
    { role: "user", content: "Hello World!" },
    { role: "assistant", content: "Hello User!" },
  ];

  let markdown = messagesToMarkdown(messages);

  let expectedMarkdown = `## user

Hello World!

## assistant

Hello User!
`;
  assert.equal(markdown, expectedMarkdown);
});

test("messagesToMarkdown: with file", () => {
  let messages: CoreMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: "Check this file " },
        { type: "file", data: "path/to/file.txt", mimeType: "" },
      ],
    },
    { role: "assistant", content: "thanks!" },
  ];

  let markdown = messagesToMarkdown(messages);

  let expectedMarkdown = `## user

Check this file [file](path/to/file.txt)

## assistant

thanks!
`;

  assert.equal(markdown, expectedMarkdown);
});

test("messagesToMarkdown: with tool call and response", () => {
  let messages: CoreMessage[] = [
    {
      role: "user",
      content: "call the tool for me",
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "will do!\n" },
        {
          type: "tool-call",
          toolCallId: "1234",
          toolName: "myTool",
          args: { msg: "hello tool" },
        },
      ],
    },

    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "1234",
          toolName: "myTool",
          result: { response: "hello agent" },
        },
      ],
    },
  ];

  let markdown = messagesToMarkdown(messages);

  let expectedMarkdown = `## user

call the tool for me

## assistant

will do!

\`\`\`tool-call
{
  "toolCallId": "1234",
  "toolName": "myTool",
  "args": {
    "msg": "hello tool"
  }
}
\`\`\`

## tool

\`\`\`tool-result
{
  "toolCallId": "1234",
  "toolName": "myTool",
  "result": {
    "response": "hello agent"
  }
}
\`\`\`
`;
  assert.equal(markdown, expectedMarkdown);
});

import assert from "node:assert";
import test from "node:test";
import { markdownToMessages } from "./markdown-parse.js";
import type { CoreMessage } from "ai";
test("markdownToMessages", async (t) => {
  await t.test("minimal example", () => {
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

  await t.test("empty user message", () => {
    let markdown = `
## user

`;
    let messages = markdownToMessages(markdown);
    let expectedResult: CoreMessage[] = [{ role: "user", content: "" }];
    assert.deepEqual(messages, expectedResult);
  });

  await t.test("with tool call and response", () => {
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

  await t.test("tool-result with nested markdown", () => {
    const markdown = `
## assistant

\`\`\`tool-call
{
  "toolCallId": "xyz",
  "toolName": "generateDoc",
  "args": { "title": "Nested Test" }
}
\`\`\`

## tool

\`\`\`tool-result
{
  "toolCallId": "xyz",
  "toolName": "generateDoc",
  "result": {
    "content": "## innerHeading\\n\\nThis is **inside** the result.\\n\\n\`\`\`js\\nconsole.log(\\"hello\\");\\n\`\`\`\\n"
  }
}
\`\`\`

## user

Finished reviewing.
`;

    const messages = markdownToMessages(markdown);
    const expected: CoreMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "xyz",
            toolName: "generateDoc",
            args: { title: "Nested Test" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "xyz",
            toolName: "generateDoc",
            result: {
              content:
                '## innerHeading\n\nThis is **inside** the result.\n\n```js\nconsole.log("hello");\n```\n',
            },
          },
        ],
      },
      {
        role: "user",
        content: "Finished reviewing.",
      },
    ];

    assert.deepEqual(messages, expected);
  });

  await t.test("case-insensitive roles with valid tool-call", () => {
    const md = `
## User

Hello user!

## Assistant

\`\`\`tool-call
{"toolCallId":"123","toolName":"foo","args":{"x":1}}
\`\`\`

## TOOL

\`\`\`tool-result
{"toolCallId":"123","toolName":"foo","result":{"ok":true}}
\`\`\`
`;
    const msgs = markdownToMessages(md);
    assert.deepEqual(msgs, [
      { role: "user", content: "Hello user!" },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "123",
            toolName: "foo",
            args: { x: 1 },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "123",
            toolName: "foo",
            result: { ok: true },
          },
        ],
      },
    ]);
  });

  await t.test("reject tool-call in user role", () => {
    const md = `
## User

\`\`\`tool-call
{"toolCallId":"u","toolName":"bad","args":{}}
\`\`\`
`;
    assert.throws(() => markdownToMessages(md), {
      message: /Tool calls are only allowed in assistant messages/,
    });
  });

  await t.test("reject tool-result in assistant role", () => {
    const md = `
## assistant

\`\`\`tool-result
{"toolCallId":"x","toolName":"y","result":{}}
\`\`\`
`;
    assert.throws(() => markdownToMessages(md), {
      message: /Tool results are only allowed in tool messages/,
    });
  });

  await t.test("reject malformed tool-call JSON", () => {
    const md = `
## assistant

\`\`\`tool-call
{not: "json"}
\`\`\`
`;
    assert.throws(() => markdownToMessages(md));
  });

  await t.test("reject tool-call schema mismatch", () => {
    const md = `
## assistant

\`\`\`tool-call
{"toolCallId":123,"toolName":"foo","args":{}}
\`\`\`
`;
    assert.throws(() => markdownToMessages(md));
  });

  await t.test("reject malformed tool-result JSON", () => {
    const md = `
## tool

\`\`\`tool-result
{broken json}
\`\`\`
`;
    assert.throws(() => markdownToMessages(md));
  });

  await t.test("reject tool-result schema mismatch", () => {
    const md = `
## tool

\`\`\`tool-result
{"toolCallId":"z","toolName":"x","result":"not an object"}
\`\`\`
`;
    assert.throws(() => markdownToMessages(md));
  });
});

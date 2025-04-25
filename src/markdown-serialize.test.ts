import { test } from "node:test";
import { strict as assert } from "node:assert";
import { messagesToMarkdown } from "./markdown-serialize.js";
import type { CoreMessage } from "ai";

test("messagesToMarkdown: with tool call and response", () => {
  const messages: CoreMessage[] = [
    { role: "user", content: "call the tool for me" },
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

  const markdown = messagesToMarkdown(messages);

  const expected = `## user

call the tool for me

## assistant

will do!

\`\`\`tool-call
{"toolCallId":"1234","toolName":"myTool","args":{"msg":"hello tool"}}
\`\`\`

## tool


\`\`\`tool-result
{"toolCallId":"1234","toolName":"myTool","result":{"response":"hello agent"}}
\`\`\`
`;

  assert.equal(markdown, expected);
});

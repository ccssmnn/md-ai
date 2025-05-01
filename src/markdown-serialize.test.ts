import { test } from "node:test";
import { strict as assert } from "node:assert";

import type { CoreMessage } from "ai";

import { messagesToMarkdown } from "./markdown-serialize.js";

test("messagesToMarkdown", async (t) => {
  await t.test("with tool call and response", () => {
    let messages: CoreMessage[] = [
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

    let markdown = messagesToMarkdown(messages);

    let expected = `## user

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
});

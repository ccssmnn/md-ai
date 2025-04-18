‼️ This is still work in progress

TODO:

- Add more tools for reading files and directories
- Allow picking a model via CLI flag
- Enable / Disable tools via flags
- Tools for writing files and executing commands.

# Markdown AI

A command-line tool and library for working with AI using markdown in your own `$EDITOR`.

## Features

- CLI or Library - Library allows you to provide a custom model and custom tools.
- The entire Chat is Markdown, including tool calls.
- Opens your `$EDITOR` for editing the chat - you can edit everything with your preferred editor.
- Tool calling.
- Custom system prompt.
- Streams responses from AI models to the console while they are generated.

## How does this work?

At the core the chat is serialized into markdown after each AI invocation.
You can read and edit the markdown and it will be parsed into messages before sent to the AI.

Example:

```
## User

call the tool for me

## Assistant

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

## Tool


\`\`\`tool-result
{
  "toolCallId": "1234",
  "toolName": "myTool",
  "result": {
    "response": "hello agent"
  }
}
\`\`\`
```

Will be parsed into

```typescript
import type { CoreMessage } from "ai";

let messages: Array<CoreMessage> = [
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
```

## Command-line Usage

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=blablabla # uses gemini 2.0 flash
export EDITOR="hx +99999" # defaults to vi
# or
export EDITOR="code --wait"

node lib/cli.js chat.md --system=system.md
```

## Library Usage

The package can also be used as a library in your own script.
By using `MarkdownAI` this way, you can provide your own tools and model:

```javascript
import { MarkdownAI, tools } from "md-ai";

const chat = new MarkdownAI({
  path: "./my-chat.md",
  editor: "code --wait",
  ai: {
    // these are forwarded to the "ai" `steamText` call
    model: google("gemini-2.0-flash"),
    system: "You are a helpful assistant.",
    maxSteps: 5,
    tools: {
      readFile: tools.createReadFileTool({ shouldAsk: true }),
      // your custom tools
    },
  },
});

await chat.run();
```

## Why does this exist?

My opinions:

- LLM Chat Editing experience is bad
- Editing experience in _my editor_ is good
- LLMs respond in markdown anyway
- Markdown in editors comes with syntax highlighting for free
- Lives on my machine, uses my API keys, can use my tools

## License

MIT

# Markdown AI

A command-line tool and library for agentic coding using markdown in your own `$EDITOR`.

## Why does this exist?

My opinions:

- LLM Chat Editing experience is bad
- Editing experience in _my editor_ is good
- LLMs respond in markdown anyway
- Markdown in editors comes with syntax highlighting for free
- Lives on my machine, uses my API keys, can use my tools

## Installation

Install as a library:

```bash
npm install @ccssmnn/md-ai
# or
pnpm add @ccssmnn/md-ai
```

Install CLI globally:

```bash
npm install -g @ccssmnn/md-ai
```

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
export GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
```

Run the Markdown AI CLI:

```bash
md-ai <chat.md> [options]
```

Examples:

```bash
md-ai chat.md --system system.md --model google:gemini-2.0-flash --max-steps=5
md-ai chat.md --model openai:gpt-4 --cwd ./src
```

Options:

- -s, --system <path> Path to a file containing a system prompt.
- --no-tools Disable file tools (pure chat mode)
- -m, --model <provider:model> Provider and model to use (default: google:gemini-2.0-flash).
- --max-steps <number> Maximum number of tool-calling steps (default: 10).
- -e, --editor <cmd> Editor command (default: $EDITOR or 'vi +99999').
- -c, --cwd <path> Working directory for file tools (default: current working directory).
- --no-tools Disable file tools (pure chat mode)

## Library Usage

The package can also be used as a library in your own script.
By using `MarkdownAI` this way, you can provide your own tools and model:

```javascript
import { google } from "@ai-sdk/google";
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
      readFiles: tools.createReadFilesTool(),
      listFiles: tools.createListFilesTool(),
      writeFiles: tools.createWriteFilesTool(),
      // your custom tools
    },
  },
});

await chat.run();
```

## License

MIT

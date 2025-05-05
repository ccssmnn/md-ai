# Markdown AI

A command-line tool and library for agentic coding using markdown in your own `$EDITOR`.

## Why does this exist?

My opinions:

- LLM Chat Editing experience in web and editor UIs is bad
- Editing files experience in _my editor_ is good
- LLMs respond in markdown anyway
- Markdown in editors comes with syntax highlighting for free
- Lives on my machine, uses my API keys, can use my tools

## Features

- The entire chat is stored as a single markdown file, including tool calls.
- Chat with the LLM in the terminal.
- Open your editor from the CLI to edit the entire chat history, continue after the editor is closed.
- Built in tools for listing, reading, searching and writing files. Asks for permission when writing.
- Provide a custom system prompt.
- Library mode allows you to provide a custom model and custom tools and plug MCP servers via [MCP Tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#mcp-tools).

## Installation

Install as a library:

```bash
npm install @ccssmnn/md-ai
```

Install CLI globally:

```bash
npm install -g @ccssmnn/md-ai
```

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
      { type: "text", text: "will do!" },
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

## Configuration File

Markdown AI supports loading configuration from a `config.json` file. By default, it looks for a config file at `~/.config/md-ai/config.json`. You can specify a custom config file path using the `--config` flag.

CLI flags take precedence over settings in the configuration file. If a setting is provided both via a flag and in the config file, the flag's value will be used.

The `config.json` file is a simple JSON object with the following optional keys:

- `model`: Specifies the default AI model (e.g., `"google:gemini-2.0-flash"`).
- `system`: Specifies the path to a default system prompt file.
- `editor`: Specifies the default editor command.
- `compression`: Boolean to enable/disable compression for tool call/result fences.

Example `config.json`:

```json
{
  "model": "openai:gpt-4o",
  "editor": "code --wait",
  "system": "path/to/system-prompt.md"
}
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
md-ai chat.md --system system.md --model google:gemini-2.0-flash
md-ai chat.md --model openai:gpt-4o --cwd ./apps/www
```

Options:

- `--config <path>` Custom config file path. Defaults to `~/.config/md-ai/config.json`. CLI flags take precedence over config file settings.
- `--show-config` Log the final configuration being used.
- `-s, --system <path>` Path to a file containing a system prompt.
- `-m, --model <provider:model>` Provider and model to use (default: google:gemini-2.0-flash).
- `-e, --editor <cmd>` Editor command (default: $EDITOR or 'vi +99999').
- `-c, --cwd <path>` Working directory for file tools (default: current working directory).
- `--no-tools` Disable all tools (list, read, write, grep) (pure chat mode)
- `--no-compression` Disable compression for tool call/result fences

## Library Usage

The package can also be used as a library in your own script.
By using `MarkdownAI` this way, you can provide custom tools and model:

```javascript
import { google } from "@ai-sdk/google";
import { MarkdownAI, tools } from "@ccssmnn/md-ai";

let chat = new MarkdownAI({
  path: "./chat.md",
  editor: "code --wait",
  ai: {
    // these are forwarded to the "ai" `steamText` call
    model: google("gemini-2.0-flash"),
    system: "You are a helpful assistant.",
    tools: {
      readFiles: tools.createReadFilesTool({ cwd: "./" }),
      listFiles: tools.createListFilesTool({ cwd: "./" }),
      writeFiles: tools.createWriteFilesTool({ cwd: "./" }),
      grepSearch: tools.createGrepSearchTool({ cwd: "./" }),
      // your custom tools
    },
  },
});

await chat.run();
```

## License

MIT

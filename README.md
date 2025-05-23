# Markdown AI

[![npm version](https://img.shields.io/npm/v/@ccssmnn/md-ai.svg)](https://www.npmjs.com/package/@ccssmnn/md-ai) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A command-line tool and library for agentic coding using markdown in your own `$EDITOR`.

---

Markdown AI enables seamless interaction with large language models (LLMs) directly from your terminal and favorite editor, using markdown for storing the chat.

## Why does this exist?

- LLM chat editing experience in web and editor UIs is bad.
- Editing files in _your_ editor is good.
- LLMs naturally respond in markdown.
- Markdown editors come with syntax highlighting and rich editing features.
- Runs locally on your machine, uses your API keys, and can leverage local tools.

## Features

- Entire chat history stored as a single markdown file.
- Chat with the LLM in the terminal.
- Open your editor from the CLI to edit the entire chat history and continue after closing the editor.
- Built-in tools for listing, reading, searching, and writing files, with permission prompts for writing.
- Support for custom system prompts.
- Library mode for custom models, tools, and integration with MCP servers via [MCP Tools](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling#mcp-tools).

## Getting Started

```bash
npm install -g @ccssmnn/md-ai
```

Set your API key (example for Google Generative AI):

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=your_api_key
```

Start a chat session:

```bash
md-ai chat.md
```

## Tools

- `listFiles`: Lists files in the working directory.
- `readFiles`: Reads file contents.
- `writeFiles`: Writes content to files with permission prompts.
- `grepSearch`: Searches text in files using grep.
- `execCommand`: Executes shell commands with permission prompts.
- `fetchUrlContent`: Fetches and extracts relevant text content from a given URL, returning the content and a list of links with descriptions found on the page.

## Usage

### CLI

```bash
md-ai <chat.md> [options]
```

Options:

- `--config <path>` Custom config file path.
- `--show-config` Show the final configuration.
- `-s, --system <path>` Path to system prompt file.
- `-m, --model <provider:model>` AI model to use (default: google:gemini-2.0-flash).
- `-e, --editor <cmd>` Editor command (default: $EDITOR or 'vi +99999').
- `-c, --cwd <path>` Working directory for file tools.
- `--no-tools` Disable all tools (pure chat mode).
- `--no-compression` Disable compression for tool call/result fences.

### Editor

#### VS Code

![Markdown AI VS Code Demo](/assets/md-ai-vs-code-demo.webp)

Set the editor command:

```bash
md-ai -e 'code --wait' chat.md
```

Or in config file:

```json
{ "editor": "code --wait" }
```

Recommended Shortcuts:

- **Symbol Search (`ctrl+shift+o`)**: Navigate chat history via headings.
- **Jump to End (`ctrl+end`)**: Quickly jump to the end of the chat.
- **Save (`ctrl+s`) and Close (`ctrl+w`)**: Save and close the chat file to trigger the AI call.
- **Focus Terminal (`ctrl+alt+j`)**: Focus terminal panel.
- **Focus Editor (`ctrl+1`)**: Jump back to editor.
- **Toggle Panel (`ctrl+j`)**: Show/hide terminal panel.
- **Maximize Panel (`ctrl+shift+j`)**: Maximize terminal panel.

### Library

Use as a library with custom tools and models:

```javascript
import { google } from "@ai-sdk/google";
import { MarkdownAI, tools } from "@ccssmnn/md-ai";

let chat = new MarkdownAI({
  path: "./chat.md",
  editor: "code --wait",
  ai: {
    model: google("gemini-2.0-flash"),
    system: "You are a helpful assistant.",
    tools: {
      readFiles: tools.createReadFilesTool({ cwd: "./" }),
      listFiles: tools.createListFilesTool({ cwd: "./" }),
      writeFiles: tools.createWriteFilesTool({ cwd: "./" }),
      grepSearch: tools.createGrepSearchTool({ cwd: "./" }),
      execCommand: tools.createExecCommandTool({
        cwd: "./",
        session: { alwaysAllow: new Set() },
      }),
    },
  },
});

await chat.run();
```

## Configuration

Markdown AI supports a `config.json` file (default location: `~/.config/md-ai/config.json`). CLI flags override config file settings.

Example `config.json`:

```json
{
  "model": "openai:gpt-4o",
  "editor": "code --wait",
  "system": "path/to/system-prompt.md"
}
```

## How does it work?

The chat is serialized into markdown after each AI invocation. You can edit the markdown file directly, and it will be parsed into messages before sending to the AI.

Example markdown chat snippet:

```markdown
## User

call the tool for me

## Assistant

will do!

\`\`\`tool-call
{
"toolCallId": "1234",
"toolName": "myTool",
"args": { "msg": "hello tool" }
}
\`\`\`

## Tool

\`\`\`tool-result
{
"toolCallId": "1234",
"toolName": "myTool",
"result": { "response": "hello agent" }
}
\`\`\`
```

This is parsed into structured messages for the AI.

## License

MIT

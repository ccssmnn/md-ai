# Markdown AI

A command-line tool and library for working with AI using markdown in your own `$EDITOR`.

## How does this work?

The chat is stored as markdown on the file system.
The markdown file follows these conventions:

- `## User` and `## Assistant` (not case sensitive) headings split the markdown file into the respective messages
- a file ending with a non empty user message will ask to call the LLM
- otherwise the user is asked to edit the file

You are free to edit or delete the models responses or your own messages.
I tend to have the same process and just wipe the file unless I want to keep it.

## Goals

- always markdown
- support custom editors
- support custom models
- tool calling

## Features

- Uses markdown for chat history.
- Opens your editor for editing the chat.
- Supports system prompts.
- Streams responses from AI models to the console while they are generated.
- Use as CLI or library

## Command-line Usage

```bash
export GOOGLE_GENERATIVE_AI_API_KEY=blablabla # uses gemini 2.0 flash
export EDITOR="hx +99999" # defaults to vi
# or
export EDITOR="code --wait"
md-chat chat.md --system=system.md
```

## Library Usage

The package can also be used as a library in your own scripts:

```javascript
import { MarkdownChat } from "markdown-chat";

const chat = new MarkdownChat({
  // provide your own model
  model: google("gemini-2.0-flash"),
  path: "./my-chat.md",
  systemPrompt: "You are a helpful assistant.",
  // set the editor
  editor: "code --wait",
  tools: {
    // provide tools that the llm can access
  },
});

await chat.run();
```

## Why does this exist?

- LLM Chat Editing experience is bad
- Editing experience in my editor is good
- LLMs respond in markdown anyway
- Markdown has syntax highlighting
- Lives on my machine, uses my API keys

## License

MIT

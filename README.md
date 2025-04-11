# Markdown Chat

A command-line tool for chatting with AI using markdown in your own `$EDITOR`.

## Usage

```bash
./cli.js <chat_file_path> [--system=<system_prompt_path>] [-d]
```

- `<chat_file_path>`: Path to the markdown file for the chat history.
- `--system=<system_prompt_path>`:  Optional path to a file containing the system prompt.
- `-d`: Optional flag to set `IS_DEV` environment variable.

## Why does this exist?

When chatting with AI I want to use my editor of choice to write and read the chat.
I also want to choose the model and use my own API key.

## How does this work?

The chat is stored as a `.md`-file and opened in your `$EDITOR`.
By relying on markdown, you get movements, syntax highlighting and other conveniences you are used to while prompting the model.

You are also free to edit or delete the models responses or your own messages.
I tend to have the same process and just wipe the file unless i want to keep it.

## Features

- Uses markdown for chat history, making it human-readable and editable with your preferred editor.
- Supports system prompts.
- Streams responses from AI models to the console.
- Plug your model of choice by using the `MarkdownChat` class in your own script.

## License

MIT

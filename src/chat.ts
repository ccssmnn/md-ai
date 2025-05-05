import { appendFile, readFile, writeFile } from "node:fs/promises";

import { streamText } from "ai";
import type { CoreMessage } from "ai";

import { markdownToMessages } from "./markdown-parse.js";
import { messagesToMarkdown } from "./markdown-serialize.js";
import {
  confirm,
  isCancel,
  log,
  select,
  spinner,
  stream,
  text,
} from "@clack/prompts";
import { openInEditor } from "./editor.js";

/** Options for configuring a markdown-backed ai session */
export interface MarkdownAIOptions {
  /** The path to the markdown file containing the chat history.*/
  path: string;
  /** Editor to use for user input. e.g. `code --wait` or `hx +99999` */
  editor: string;
  /** Enables compression of args and results in tool fences in the markdown, defaults to true */
  withCompression?: boolean;

  /** arguments that will be forwarded to the ai sdk `streamText` call */
  ai: AISDKArgs;
}

/** A class for managing markdown-based chat sessions with a language model */
export class MarkdownAI {
  editor: string;
  chatPath: string;
  ai: AISDKArgs;
  withCompression: boolean | undefined;

  constructor(options: MarkdownAIOptions) {
    this.chatPath = options.path;
    this.editor = options.editor;
    this.ai = options.ai;
    this.withCompression = options.withCompression ?? true;
  }

  /** runs the main chat loop */
  async run(): Promise<void> {
    let proceed = true;
    while (proceed) {
      let messages = await this.readAndParseChatFile();
      let nextTurn = determineNextTurn(messages);
      if (nextTurn.role === "user") {
        proceed = await this.performUserTurn(nextTurn.addHeading);
        continue;
      }
      if (nextTurn.role === "assistant") {
        proceed = await this.performAITurn(messages, nextTurn.skipConfirm);
        continue;
      }
      nextTurn satisfies never;
    }
  }

  private async performUserTurn(addHeading = false): Promise<boolean> {
    if (addHeading) {
      await appendFile(this.chatPath, "\n## user\n");
    }
    let shouldOpenEditor = await select({
      message: "Your turn. What do you want to do?",
      options: [
        {
          value: "open-editor",
          label: `Open the editor '${this.editor}'`,
        },
        {
          value: "prompt-directly",
          label: "Write my message in the CLI",
        },
        { value: "stop", label: "Stop" },
      ] as const,
      initialValue: "open-editor" as const,
    });
    if (isCancel(shouldOpenEditor)) {
      return false;
    }
    if (shouldOpenEditor === "stop") {
      return false;
    }
    if (shouldOpenEditor === "open-editor") {
      await openInEditor(this.editor, this.chatPath);
      return true;
    }
    if (shouldOpenEditor === "prompt-directly") {
      let message = await text({
        message: "Your message:",
        placeholder: "...",
      });
      if (isCancel(message)) return true;
      await appendFile(this.chatPath, message);
      return true;
    }
    shouldOpenEditor satisfies never;
    return false;
  }

  private async performAITurn(
    messages: CoreMessage[],
    skipConfirm = false,
  ): Promise<boolean> {
    if (!skipConfirm) {
      let check = await confirm({ message: "Call the LLM?" });
      if (check !== true) return false;
    }

    let msgs = [...messages];
    if (this.ai.system) {
      msgs.unshift({ role: "system", content: this.ai.system });
    }

    let requestOptions = {
      ...this.ai,
      system: systemPrompt,
      messages: msgs,
    };

    // show spinner while waiting for model to start streaming
    let spin = spinner();
    spin.start("Thinking...");
    let { textStream, response } = streamText({
      ...requestOptions,
      onError: ({ error }) => log.error(`⚠️ streamText error: ${error}`),
    });

    // stop spinner on first token and forward all chunks
    let interceptedStream = (async function* () {
      let first = true;
      for await (let chunk of textStream) {
        if (first) {
          spin.stop();
          first = false;
        }
        yield chunk;
      }
    })();

    // ensure spinner is stopped even if no tokens were streamed
    try {
      await stream.message(interceptedStream);
    } finally {
      spin.stop();
    }

    let responseMessages = (await response).messages;

    await this.writeChatFile([...messages, ...responseMessages]);

    return true;
  }

  private async readAndParseChatFile(): Promise<CoreMessage[]> {
    let chatFileContent = await readFile(this.chatPath, { encoding: "utf-8" });
    let messages = markdownToMessages(chatFileContent);
    return messages;
  }

  private async writeChatFile(messages: CoreMessage[]): Promise<void> {
    let content = messagesToMarkdown(messages, this.withCompression);
    await writeFile(this.chatPath, content, { encoding: "utf-8" });
  }
}

type AISDKArgs = Omit<Parameters<typeof streamText>[0], "messages" | "prompt">;

type NextTurn =
  | { role: "user"; addHeading: boolean }
  | { role: "assistant"; skipConfirm: boolean };

function determineNextTurn(chat: CoreMessage[]): NextTurn {
  let lastMessage = chat.at(-1);
  if (!lastMessage) {
    return { role: "user", addHeading: true };
  }

  if (lastMessage.role === "assistant") {
    return { role: "user", addHeading: true };
  }

  if (lastMessage.role === "system") {
    return { role: "user", addHeading: true };
  }

  if (lastMessage.role === "tool") {
    return { role: "assistant", skipConfirm: true };
  }

  if (lastMessage.content.length === 0) {
    return { role: "user", addHeading: false };
  }

  return { role: "assistant", skipConfirm: false };
}

let systemPrompt = `
You are operating as Markdown-AI, an agentic coding assistant that lives in the terminal.
It offers interacting with LLMs in the terminal combined with the users editor of choice.
You are expected to be helpful and precise.

You can:
- Receive user prompts, project context and files.
- Stream responses and emit tool calls: (e.g. list, read and manipulate files)
- Write code via tool calls.

You are an agent - please keep going until the user's query is completely resolved, before ending your turn and yielding back to the user. Only terminate your turn when you are sure that the problem is solved. If you are not sure about file content or codebase structure pertaining to the user's request, use your tools to read files and gather the relevant information: do NOT guess or make up an answer.
`;

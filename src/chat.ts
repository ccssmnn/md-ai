import { appendFile, readFile, writeFile } from "node:fs/promises";
import { stdout } from "node:process";

import { streamText } from "ai";
import type { CoreMessage } from "ai";

import { logger } from "./utils.js";
import { markdownToMessages } from "./markdown-parse.js";
import { messagesToMarkdown } from "./markdown-serialize.js";
import { confirm, isCancel, log, select, stream } from "@clack/prompts";
import { openInEditor } from "./prompts.js";

type AISDKArgs = Omit<Parameters<typeof streamText>[0], "messages" | "prompt">;

/** Options for configuring a markdown-backed ai session */
export interface MarkdownAIOptions {
  /** The path to the markdown file containing the chat history.*/
  path: string;
  /** Editor to use for user input. e.g. `code --wait` or `hx +99999` */
  editor: string;

  /** arguments that will be forwarded to the ai sdk `streamText` call */
  ai: AISDKArgs;
}

/** A class for managing markdown-based chat sessions with a language model */
export class MarkdownAI {
  editor: string;
  chatPath: string;

  ai: AISDKArgs;

  constructor(options: MarkdownAIOptions) {
    this.chatPath = options.path;
    this.editor = options.editor;

    this.ai = options.ai;
  }

  /** Runs the chat session. */
  async run(): Promise<void> {
    let canCallLLM = false;
    while (true) {
      let chat = await this.readChat();
      let next = determineNextTurn(chat);
      if (next.role === "user") {
        let proceed = await this.userturn(next.addHeading);
        if (!proceed) break;
        canCallLLM = false;
        continue;
      }
      if (!canCallLLM) {
        let check = await confirm({
          message: "Call the LLM?",
          initialValue: true,
        });
        if (check !== true) break;
        canCallLLM = true;
      }
      let proceed = await this.aiturn(chat);
      if (!proceed) break;
    }
  }

  /**
   * Handles a user turn in the chat.
   * @param addHeading - Whether to add a heading for the user message.
   * @returns A promise that resolves to true if the user wants to continue the chat, false otherwise.
   */
  private async userturn(addHeading = false): Promise<boolean> {
    if (addHeading) {
      await appendFile(this.chatPath, "\n## user\n");
    }
    const shouldOpenEditor = await confirm({
      message: "Open Editor to enter user message?",
      initialValue: true,
    });
    if (shouldOpenEditor !== true) return false;
    await openInEditor(this.editor, this.chatPath);
    return true;
  }

  /**
   * Handles a model turn in the chat.
   * @param messages - The current chat history.
   * @returns A promise that resolves to true if the model generated a response, false otherwise.
   */
  private async aiturn(messages: CoreMessage[]): Promise<boolean> {
    let requestOptions = {
      ...this.ai,
      system: `${systemPrompt}\n${this.ai.system ?? ""}`,
      messages,
    };

    let { textStream, response } = streamText(requestOptions);

    await stream.message(textStream);

    let responseMessages = (await response).messages;

    await this.writeChat([...messages, ...responseMessages]);

    return true;
  }

  /**
   * Reads the chat history from the markdown file.
   * @returns A promise that resolves to the chat history as an array of messages.
   */
  private async readChat(): Promise<CoreMessage[]> {
    let chatFileContent = await readFile(this.chatPath, { encoding: "utf-8" });
    let messages = markdownToMessages(chatFileContent);
    return messages;
  }

  /**
   * Writes the chat history to the markdown file.
   * @param messages - The chat history to write.
   * @returns a promise that resolves when the chat history has been written.
   */
  private async writeChat(messages: CoreMessage[]): Promise<void> {
    let content = messagesToMarkdown(messages);
    await writeFile(this.chatPath, content, { encoding: "utf-8" });
  }
}

/**
 * Represents the next turn in the chat.
 */
type NextTurn = { role: "user"; addHeading: boolean } | { role: "assistant" };

/**
 * Determines the next turn in the chat based on the current chat history.
 * @param chat - The current chat history.
 * @returns An object representing the next turn.
 */
function determineNextTurn(chat: CoreMessage[]): NextTurn {
  let lastMessage = chat.at(-1);
  if (!lastMessage || lastMessage.role === "assistant") {
    return {
      role: "user",
      addHeading: true,
    };
  }
  if (
    lastMessage.role === "user" &&
    typeof lastMessage.content === "string" &&
    lastMessage.content.length === 0
  ) {
    return {
      role: "user",
      addHeading: false,
    };
  }

  return { role: "assistant" };
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

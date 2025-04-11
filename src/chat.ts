import { appendFile, readFile, writeFile } from "node:fs/promises";
import { stdout } from "node:process";

import { streamText } from "ai";
import type { CoreMessage, ToolSet, LanguageModelV1 } from "ai";

import { markdownToMessages, messagesToMarkdown } from "./markdown.js";
import { askUser, openInEditor } from "./prompts.js";

/**
 * Options for configuring a markdown-based chat session.
 */
export interface MarkdownChatOptions {
  /**
   * The path to the markdown file containing the chat history.
   */
  path: string;
  /**
   * The language model to use for generating responses.
   */
  model: LanguageModelV1;
  /**
   * Optional system prompt to use for the chat.
   */
  systemPrompt?: string;
  /**
   * Optional editor to use for user input. Defaults to $EDITOR or 'vi'.
   */
  editor?: string;
  /**
   * Optional tools to provide to the language model.
   */
  tools?: ToolSet;

  /**
   *
   */
  maxSteps?: number;
}

/**
 * Options for running a script with markdown chat.
 */
export interface ScriptOptions extends MarkdownChatOptions {
  /**
   * Custom model configuration options if needed
   */
  modelOptions?: Record<string, any>;

  /**
   * Optional custom configuration for the script
   */
  config?: Record<string, any>;
}

/**
 * A class for managing markdown-based chat sessions with a language model.
 */
export class MarkdownChat implements MarkdownChat {
  /**
   * The system prompt to use for the chat.
   */
  systemPrompt: string | undefined;
  /**
   * The path to the markdown file containing the chat history.
   */
  chatPath: string;
  /**
   * The editor to use for user input.
   */
  editor: string;
  /**
   * The language model to use for generating responses.
   */
  model: LanguageModelV1;
  /**
   * Optional tools to provide to the language model.
   */
  tools: ToolSet | undefined;

  maxSteps: number;

  constructor(options: MarkdownChatOptions) {
    this.tools = options.tools;
    this.maxSteps = options.maxSteps ?? 1;
    this.chatPath = options.path;
    this.model = options.model;

    if (options.systemPrompt) {
      this.systemPrompt = options.systemPrompt;
    }

    if (options.editor) {
      this.editor = options.editor;
    } else if (process.env.EDITOR) {
      this.editor = process.env.EDITOR;
    } else {
      this.editor = "vi +999999999";
    }
  }

  /**
   * Runs the chat session.
   */
  async run(): Promise<void> {
    let proceed = true;
    while (proceed) {
      let chat = await this.readChat();
      let next = nextTurn(chat);
      if (next.role === "user") {
        proceed = await this.userturn(next.addHeading);
      } else {
        proceed = await this.modelturn(chat);
      }
    }
    console.log("🤓: ok, bye! 👋");
  }

  /**
   * Handles a user turn in the chat.
   * @param addHeading - Whether to add a heading for the user message.
   * @returns A promise that resolves to true if the user wants to continue the chat, false otherwise.
   */
  async userturn(addHeading = false): Promise<boolean> {
    if (addHeading) {
      await appendFile(this.chatPath, "\n## User\n");
    }
    let answer = await askUser(
      "🤓: open editor to enter user message?\n(y/n): ",
    );
    if (answer.toLowerCase() !== "y") {
      return false;
    }
    await openInEditor(this.editor, this.chatPath);
    return true;
  }

  /**
   * Handles a model turn in the chat.
   * @param chat - The current chat history.
   * @returns A promise that resolves to true if the model generated a response, false otherwise.
   */
  async modelturn(chat: CoreMessage[]): Promise<boolean> {
    let answer = await askUser("🤓: invoke the LLM?\n(y/n): ");
    if (answer.toLowerCase() !== "y") {
      return false;
    }

    let messages = [...chat];
    if (this.systemPrompt) {
      messages.unshift({
        role: "system",
        content: this.systemPrompt,
      });
    }

    let requestOptions = {
      model: this.model,
      messages,
      ...(this.tools && { tools: this.tools, maxSteps: this.maxSteps }),
    };

    let response = streamText(requestOptions);

    let accumulatedResponse = "";
    for await (let chunk of response.textStream) {
      stdout.write(chunk);
      accumulatedResponse += chunk;
    }

    chat.push({ role: "assistant", content: accumulatedResponse });
    await this.writeChat(chat);

    return true;
  }

  /**
   * Reads the chat history from the markdown file.
   * @returns A promise that resolves to the chat history as an array of messages.
   */
  async readChat(): Promise<CoreMessage[]> {
    let chatFileContent = await readFile(this.chatPath, { encoding: "utf-8" });
    let messages = markdownToMessages(chatFileContent);
    return messages;
  }

  /**
   * Writes the chat history to the markdown file.
   * @param messages - The chat history to write.
   * @returns a promise that resolves when the chat history has been written.
   */
  async writeChat(messages: CoreMessage[]): Promise<void> {
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
function nextTurn(chat: CoreMessage[]): NextTurn {
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

import { appendFile, readFile, writeFile } from "node:fs/promises";
import { stdout } from "node:process";

import { streamText } from "ai";
import type { CoreMessage } from "ai";

import { askUser, openInEditor } from "./prompts.js";
import { logger } from "./utils.js";
import { markdownToMessages } from "./markdown-parse.js";
import { messagesToMarkdown } from "./markdown-serialize.js";

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
    let proceed = true;
    while (proceed) {
      let chat = await this.readChat();
      let next = determineNextTurn(chat);
      if (next.role === "user") {
        proceed = await this.userturn(next.addHeading);
      } else {
        proceed = await this.aiturn(chat);
      }
    }
    console.log("🤓: ok, bye!👋");
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
    let answer = await askUser("🤓: open editor to enter user message? (y/n)");
    if (answer.toLowerCase() !== "y") {
      return false;
    }
    await openInEditor(this.editor, this.chatPath);
    return true;
  }

  /**
   * Handles a model turn in the chat.
   * @param messages - The current chat history.
   * @returns A promise that resolves to true if the model generated a response, false otherwise.
   */
  private async aiturn(messages: CoreMessage[]): Promise<boolean> {
    let answer = await askUser("🤓: invoke the LLM? (y/n)");
    if (answer.toLowerCase() !== "y") {
      return false;
    }

    let requestOptions = { ...this.ai, messages };

    logger({ at: "beforeStreamText", requestOptions });

    let { textStream, response } = streamText(requestOptions);

    // stream response into stdout to allow reading the response while waiting
    // for the markdown file to be saved
    for await (let chunk of textStream) {
      stdout.write(chunk);
    }
    stdout.write("\n");

    let responseMessages = (await response).messages;

    logger({ at: "afterResponseReceived", responseMessages });

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

import { LanguageModelV1, CoreMessage, ToolSet } from "ai";

export interface MarkdownChatOptions {
  path: string;
  model: LanguageModelV1;
  systemPrompt?: string;
  editor?: string;
  tools?: ToolSet;
}

/**
 * A class for managing markdown-based chat sessions with a language model.
 */
export interface MarkdownChat {
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

  /**
   * Runs the chat session.
   */
  run(): Promise<void>;

  /**
   * Handles a user turn in the chat.
   * @param addHeading - Whether to add a heading for the user message.
   * @returns A promise that resolves to true if the user wants to continue the chat, false otherwise.
   */
  userturn(addHeading?: boolean): Promise<boolean>;

  /**
   * Handles a model turn in the chat.
   * @param chat - The current chat history.
   * @returns A promise that resolves to true if the model generated a response, false otherwise.
   */
  modelturn(chat: CoreMessage[]): Promise<boolean>;
  /**
   * Reads the chat history from the markdown file.
   * @returns A promise that resolves to the chat history as an array of messages.
   */
  readChat(): Promise<CoreMessage[]>;
  /**
   * Writes the chat history to the markdown file.
   * @param messages - The chat history to write.
   * @returns a promise that resolves when the chat history has been written.
   */
  writeChat(messages: CoreMessage[]): Promise<void>;
}

/**
 * Represents the next turn in the chat.
 */
export type NextTurn =
  | { role: "user"; addHeading: boolean }
  | { role: "assistant" };

/**
 * Determines the next turn in the chat based on the current chat history.
 * @param chat - The current chat history.
 * @returns An object representing the next turn.
 */
export type NextTurnFunction = (chat: CoreMessage[]) => NextTurn;

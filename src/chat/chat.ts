import { appendFile, readFile, writeFile } from "node:fs/promises";

import { streamText } from "ai";
import type { CoreMessage } from "ai";

import { markdownToMessages } from "../markdown/parse.js";
import { messagesToMarkdown } from "../markdown/serialize.js";
import { isCancel, log, select, spinner, stream, text } from "@clack/prompts";
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

/** starts the markdown ai cli loop until the user stops it */
export async function runMarkdownAI(options: MarkdownAIOptions) {
  let proceed = true;
  while (proceed) {
    let messages = await readAndParseChatFile(options.path);
    let nextTurn = determineNextTurn(messages);
    if (nextTurn.role === "user") {
      proceed = await performUserTurn({
        ...options,
        addHeading: nextTurn.addHeading,
      });
      continue;
    }
    if (nextTurn.role === "assistant") {
      proceed = await performAITurn(messages, {
        ...options,
        skipConfirm: nextTurn.skipConfirm,
      });
      continue;
    }
    nextTurn satisfies never;
  }
}

/** A class for managing markdown-based chat sessions with a language model */
async function performUserTurn(
  options: MarkdownAIOptions & { addHeading: boolean },
): Promise<boolean> {
  if (options.addHeading) {
    await appendFile(options.path, "\n## user\n");
  }
  let shouldOpenEditor = await select({
    message: "Your turn. What do you want to do?",
    options: [
      {
        value: "open-editor",
        label: `Open the editor '${options.editor}'`,
      },
      {
        value: "prompt-directly",
        label: "Write my message in the CLI",
      },
      { value: "stop", label: "Stop" },
    ] as const,
    initialValue: "open-editor" as const,
  });
  if (isCancel(shouldOpenEditor)) return false;

  if (shouldOpenEditor === "stop") return false;

  if (shouldOpenEditor === "open-editor") {
    await openInEditor(options.editor, options.path);
    return true;
  }

  if (shouldOpenEditor === "prompt-directly") {
    let message = await text({
      message: "Your message:",
      placeholder: "...",
    });
    if (isCancel(message)) return true;
    await appendFile(options.path, message);
    return true;
  }

  shouldOpenEditor satisfies never;
  return false;
}

async function performAITurn(
  messages: CoreMessage[],
  options: MarkdownAIOptions & { skipConfirm: boolean },
): Promise<boolean> {
  let action = options.skipConfirm
    ? "call-llm"
    : await select({
        message: "AI's turn. What do you want to do?",
        options: [
          { value: "call-llm", label: "Call the LLM" },
          {
            value: "open-editor",
            label: `Open the editor '${options.editor}'`,
          },
          { value: "stop", label: "Stop" },
        ] as const,
        initialValue: "call-llm" as const,
      });

  if (isCancel(action)) return false;

  if (action === "stop") return false;

  if (action === "open-editor") {
    await openInEditor(options.editor, options.path);
    return true;
  }

  action satisfies "call-llm";

  let msgs = [...messages];
  if (options.ai.system) {
    msgs.unshift({ role: "system", content: options.ai.system });
  }

  let requestOptions = {
    ...options.ai,
    system: systemPrompt,
    messages: msgs,
  };

  log.info("Calling model...");
  const { textStream, response } = streamText({
    ...requestOptions,
    onError: ({ error }) => log.error(`⚠️ streamText error: ${error}`),
  });

  await stream.message(textStream);

  let responseMessages = (await response).messages;

  await writeChatFile([...messages, ...responseMessages], options);

  return true;
}

async function readAndParseChatFile(path: string): Promise<CoreMessage[]> {
  let chatFileContent = await readFile(path, { encoding: "utf-8" });
  let messages = markdownToMessages(chatFileContent);
  return messages;
}

async function writeChatFile(
  messages: CoreMessage[],
  options: MarkdownAIOptions,
): Promise<void> {
  let content = messagesToMarkdown(messages, options.withCompression);
  await writeFile(options.path, content, { encoding: "utf-8" });
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
You are Markdown-AI, a terse, agentic coding assistant operating in the terminal with access to the user's editor and project files.

You proactively and autonomously use all available tools to explore the project and gather necessary context. Do not ask the user which files to inspect or whether to update files or run commands; user confirmations are handled by the tool implementations.

Be precise and concise. Keep working until the user's request is fully resolved before ending your turn using the tools available. If unsure about project details, use your tools to investigate—do not guess or fabricate information.`;

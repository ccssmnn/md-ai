import { appendFile, readFile, writeFile } from "node:fs/promises";
import { markdownToMessages, messagesToMarkdown } from "./markdown.js";
import { askUser, openInEditor } from "./prompts.js";
import { streamText } from "ai";
import { stdout } from "node:process";

/**
 * @typedef {import("./types.d.ts").MarkdownChat} IMarkdownChat
 */

/** @implements {IMarkdownChat} */
export class MarkdownChat {
  systemPrompt;
  chatPath;
  editor;
  model;
  tools;

  /** @param {import("./types.d.ts").MarkdownChatOptions} options */
  constructor(options) {
    this.tools = options.tools;
    this.chatPath = options.path;
    this.model = options.model;

    if (options.systemPrompt) {
      this.systemPrompt = options.systemPrompt;
    }

    if (options.editor) {
      this.editor = options.editor;
    } else {
      console.info("ℹ️ editor not set. using $EDITOR or defaulting to `vi`");
      this.editor = process.env.EDITOR || "vi";
    }
  }

  async run() {
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

  async userturn(addHeading = false) {
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
   * @param {import("ai").CoreMessage[]} chat
   */
  async modelturn(chat) {
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

    let response = streamText({ model: this.model, messages });

    let accumulatedResponse = "";
    for await (let chunk of response.textStream) {
      stdout.write(chunk);
      accumulatedResponse += chunk;
    }

    chat.push({ role: "assistant", content: accumulatedResponse });
    await this.writeChat(chat);

    return true;
  }

  async readChat() {
    let chatFileContent = await readFile(this.chatPath, { encoding: "utf-8" });
    let messages = markdownToMessages(chatFileContent);
    return messages;
  }

  /**
   * @param {import("ai").CoreMessage[]} messages
   */
  async writeChat(messages) {
    let content = messagesToMarkdown(messages);
    await writeFile(this.chatPath, content, { encoding: "utf-8" });
  }
}

/** @type {import("./types.d.ts").NextTurnFunction} */
function nextTurn(chat) {
  let lastMessage = chat.at(-1);
  if (!lastMessage || lastMessage.role === "assistant") {
    return {
      role: "user",
      addHeading: true,
    };
  }
  if (lastMessage.role === "user" && lastMessage.content.length === 0) {
    return {
      role: "user",
      addHeading: false,
    };
  }

  return { role: "assistant" };
}

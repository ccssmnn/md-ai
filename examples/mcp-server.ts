import { cwd } from "node:process";

import { google } from "@ai-sdk/google";
import { Experimental_StdioMCPTransport as StdioMCPTransport } from "ai/mcp-stdio";
import { experimental_createMCPClient as createMCPClient } from "ai";

// import { MarkdownAI, tools } from "@ccssmnn/md-ai";
import { MarkdownAI, tools } from "../src/index.js";

let mcpClient = await createMCPClient({
  name: "mcp-language-server-client",
  transport: new StdioMCPTransport({
    command: "mcp-language-server",
    args: [
      "--workspace",
      cwd(),
      "--lsp",
      "typescript-language-server",
      "--",
      "--stdio",
    ],
  }),
});

let chat = new MarkdownAI({
  path: "./chat.md",
  editor: "zed --wait",
  ai: {
    model: google("gemini-2.5-flash-preview-04-17"),
    system: "You are a helpful assistant.",
    tools: {
      readFiles: tools.createReadFilesTool({ cwd: cwd() }),
      listFiles: tools.createListFilesTool({ cwd: cwd() }),
      writeFiles: tools.createWriteFilesTool({ cwd: cwd() }),
      grepSearch: tools.createGrepSearchTool({ cwd: cwd() }),
      ...(await mcpClient.tools()),
    },
  },
});

try {
  await chat.run();
} finally {
  await mcpClient.close();
}

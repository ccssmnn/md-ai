import { spawn } from "node:child_process";
import { stdin, stdout } from "node:process";
import * as readline from "node:readline/promises";

import { shouldNeverHappen } from "./utils.js";

type PendingPrompt = {
  message: string;
  resolve: (answer: string) => void;
  reject: (err: Error) => void;
};

const promptQueue: PendingPrompt[] = [];
let activePrompt = false;

/**
 * Enqueue a prompt. Only one question will be live at a time,
 * and raw‐mode is toggled off before the question and restored after.
 */
export function askUser(message: string): Promise<string> {
  return new Promise((resolve, reject) => {
    promptQueue.push({ message, resolve, reject });
    if (!activePrompt) processNextPrompt();
  });
}

async function processNextPrompt(): Promise<void> {
  const job = promptQueue.shift();
  if (!job) {
    activePrompt = false;
    return;
  }
  activePrompt = true;

  // Preserve and disable raw‐mode if set
  const wasRaw = stdin.isTTY && stdin.isRaw;
  if (wasRaw) stdin.setRawMode(false);

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(job.message);
    rl.close();
    job.resolve(answer.trim());
  } catch (err) {
    rl.close();
    job.reject(err as Error);
  } finally {
    if (wasRaw) stdin.setRawMode(true);
    processNextPrompt();
  }
}

/**
 * Launch an external editor and wait for it to exit.
 * Ensures raw‐mode is disabled while the editor runs.
 */
export async function openInEditor(
  editor: string,
  path: string,
  ...args: string[]
): Promise<void> {
  const wasRaw = stdin.isTTY && stdin.isRaw;
  if (wasRaw) stdin.setRawMode(false);

  const [cmd, ...editorArgs] = editor.split(" ");
  if (!cmd) return shouldNeverHappen("Invalid editor command");

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, [...editorArgs, ...args, path], {
      stdio: "inherit",
      shell: false,
    });

    proc.on("close", (code) => {
      if (wasRaw) stdin.setRawMode(true);
      code === 0 ? resolve() : reject(new Error(`Editor exited ${code}`));
    });
    proc.on("error", (err) => {
      if (wasRaw) stdin.setRawMode(true);
      reject(err);
    });
  });
}

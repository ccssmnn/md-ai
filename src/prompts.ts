import { spawn } from "node:child_process";
import { stdin } from "node:process";

import { shouldNeverHappen } from "./utils.js";

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

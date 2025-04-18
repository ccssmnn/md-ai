import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { stdin as input, stdout as output } from "node:process";
import { shouldNeverHappen } from "./utils.js";

/**
 * Prompt the user with a message and get their response as a string.
 */
export async function askUser(message: string): Promise<string> {
  return new Promise((resolve) => {
    output.write(message);

    if (input.isTTY) {
      input.setRawMode(true);
    }

    input.resume();
    input.once("data", (buffer) => {
      let answer = buffer.toString().trim();
      input.pause();

      if (input.isTTY) {
        input.setRawMode(false);
      }
      output.write("\n");
      resolve(answer);
    });

    input.on("SIGINT", () => {
      process.exit(0);
    });
  });
}

/**
 * This function opens the file at path with the cmd provided and returns after the opened editor was quit
 * @param editor the command to open the editor
 * @param path to the file to open
 * @param {Array<string>} args to provide the editor (e.g. --wait for vscode or +99999 for vim)
 */
export async function openInEditor(
  editor: string,
  path: string,
  ...args: string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    let [cmd, ...editorArgs] = editor.split(" ");
    if (!cmd) {
      shouldNeverHappen(
        "splitting the editor command should not result in an empty command",
      );
    }
    let editorProcess = spawn(cmd, [...editorArgs, ...args, path], {
      stdio: "inherit",
      shell: false,
    });

    let cleanup = () => {
      output.write("\x1bc");
      if (input.isTTY) input.setRawMode(false);
    };

    editorProcess.on("close", (code) => {
      cleanup();
      if (code === 0) resolve();
      else reject(new Error(`Editor exited with code ${code}`));
    });

    editorProcess.on("error", (err) => {
      cleanup();
      reject(err);
    });
  });
}

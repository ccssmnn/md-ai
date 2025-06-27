import { spawn } from "node:child_process";
import { z } from "zod";
import { tool } from "ai";
import { isCancel, log, select, text } from "@clack/prompts";

export function createExecCommandTool(options: {
  cwd: string;
  alwaysAllow: Array<string>;
}) {
  return tool({
    description: `
Execute a shell command in the project directory.

Before running any command, the AI should carefully inspect the project files, configuration, and context to ensure the command is relevant, safe, and appropriate for the specific project environment. This includes, but is not limited to:
- Checking for existing scripts or commands defined in project configuration files (e.g., package.json scripts, Makefile, build scripts, or other relevant files).
- Verifying installed dependencies or tools that the command might rely on.
- Understanding the project structure and technology stack to avoid irrelevant or harmful commands.

The AI should tailor commands to the project's context, regardless of the project type (e.g., web, backend, data science, infrastructure, etc.).

Prompts the user for approval before running.

Examples:
- Run npm scripts: 'npm run test' (check package.json for available scripts)
- Install dependencies: 'npm install ...' or 'pnpm install ...'
- Check git status: git status
- Run the typescript compiler: 'npx tsc' or 'pnpm tsc'
`,
    parameters: execCommandParameters,
    execute: async ({ command, arguments: args, timeout, explanation }) => {
      let executable = `${command} ${args.join(" ")}`;
      if (options.alwaysAllow.includes(executable)) {
        return await runCommand(command, args, options.cwd, timeout);
      }

      log.info(
        `exec-command: the model wants to run:
\t$ ${command} ${args.join(" ")}

Explanation: ${explanation}`,
      );
      let userChoice = await select({
        message: `Allow running this command?`,
        options: [
          { value: "allow", label: "Allow once" },
          {
            value: "always",
            label: "Always allow this command in the current session",
          },
          { value: "deny", label: "Deny" },
        ],
      });
      if (userChoice === "deny") {
        let reason = await text({
          message: "Why are you denying this command? (optional)",
          placeholder: "Enter reason or press Enter to skip",
        });
        if (isCancel(reason)) throw Error("user has canceled");

        return {
          ok: false,
          status: "user-denied",
          reason:
            reason || "the user denied running this command. ask them why.",
        };
      }
      if (userChoice === "always") {
        options.alwaysAllow.push(executable);
      }
      return await runCommand(command, args, options.cwd, timeout);
    },
  });
}

let execCommandParameters = z.object({
  command: z.string().describe("The CLI command to execute (e.g. 'ls')"),
  arguments: z.array(z.string()).describe("Arguments for the command"),
  timeout: z.number().min(1).max(300).describe("Timeout in seconds (1-300)"),
  explanation: z
    .string()
    .max(120)
    .describe(
      "Short explanation for why this command should be run (displayed to the user)",
    ),
});

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeout: number,
): Promise<
  | { ok: true; stdout: string; code: number }
  | { ok: false; error: string; code?: number }
> {
  return new Promise((resolve) => {
    log.info(`exec-command: executing '${command} ${args.join(" ")}'`);
    let proc = spawn(command, args, { cwd, shell: true });
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        proc.kill("SIGKILL");
        log.warning(`exec-command: command timed out after ${timeout}s`);
        resolve({
          ok: false,
          error: `Command timed out after ${timeout}s`,
          code: -1,
        });
      }
    }, timeout * 1000);
    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });
    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    proc.on("error", (err) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        log.warning(`exec-command: command error'd: ${err.message}`);
        resolve({ ok: false, error: err.message });
      }
    });
    proc.on("close", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        log.info(`exec-command: command finished with exit code ${code ?? 0}`);
        resolve({
          ok: true,
          stdout: stdout + (stderr ? `\n[stderr]\n${stderr}` : ""),
          code: code ?? 0,
        });
      }
    });
  });
}

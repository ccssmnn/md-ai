import { readFile, unlink, writeFile } from "node:fs/promises";

import { z } from "zod";
import { tool } from "ai";

import { ensureProjectPath } from "./_shared.js";
import { mkdir, rename } from "fs/promises";
import { dirname } from "path";
import {
  isCancel,
  log,
  multiselect,
  select,
  type MultiSelectOptions,
} from "@clack/prompts";
import { shouldNeverHappen, tryCatch } from "../utils.js";

export function createWriteFilesTool(options: { cwd: string }) {
  return tool({
    description: `
STRICT PATCH FORMAT:
│
You are given a task to produce one or more patch blocks for file modifications. You MUST strictly follow the PATCH FORMAT below. Respond with only the patch text—no explanations, no apologies, no markdown or code fences, and no extra content.
│
FORMAT SPECIFICATION:
1) OUTPUT ONLY PATCH BLOCKS:
   - Do NOT include any other text or commentary.
   - Do NOT wrap your output in markdown or any other delimiters.
2) PATCH BLOCK STRUCTURE:
   - Every patch must start with a patch type declaration line: '*** Add File:', '*** Delete File:', '*** Update File:', or '*** Move File:'.
   - 'Add File' patches require a '<<< ADD' section followed by the new file content and a '>>>' terminator.
   - 'Delete File' patches consist only of the declaration line.
   - 'Update File' patches require a '<<< SEARCH' section with the exact lines to be replaced, a '===' separator, and a section with the replacement lines, followed by a '>>>' terminator.
   - 'Move File' patches require a '<<< TO' section followed by the new path and a '>>>' terminator.
   *** Add File: <relative/path/to/file>
   <<< ADD
   <new file content lines>
   >>>
   *** Delete File: <relative/path/to/file>
   *** Update File: <relative/path/to/file>
   <<< SEARCH
   <exact existing lines to replace (including context)>
   ===
   <exact replacement lines>
   >>>
   *** Move File: <relative/path/to/file>
   <<< TO
   <relative/path/to/new/file>
   >>>
3) DELIMITERS AND WHITESPACE:
   - Each delimiter (***, <<<, ===, >>>) must start at the beginning of its line.
   - Use UNIX newlines (\n) only.
   - Do NOT include trailing spaces.
4) MULTIPLE PATCHES:
   - Concatenate multiple patch blocks directly, one after another.
   - No blank lines between blocks, unless part of the file content.
   - Do not skip delimiters when concatenating patches.
5) ERROR AVOIDANCE:
   - Ensure that every '<<< ADD', '<<< SEARCH', and '<<< TO' block is properly terminated with a corresponding '>>>'.
   - The search section in 'Update File' patches must contain the exact lines present in the original file.
EXAMPLE:
"""
*** Add File: src/new.txt
<<< ADD
Hello, world!
This is a new file.
>>>
*** Delete File: src/old.txt
*** Update File: src/config.js
<<< SEARCH
port: 3000,
===
port: 4000,
>>>
*** Update File: src/config.js
<<< SEARCH
host: "localhost",
===
host: "0.0.0.0",
>>>
*** Move File: src/old.txt
<<< TO
src/new_location/old.txt
>>>
"""

Follow these rules exactly. Output begins immediately with the first *** line of the first patch block.
`,
    parameters: z.object({ patch: z.string() }),
    execute: async ({ patch: patchString }) => {
      let { cwd } = options;
      let parsedPatchesResult = tryCatch(() => parsePatchString(patchString));
      if (!parsedPatchesResult.ok) {
        return {
          ok: false,
          reason: `Error: Failed to parse patch string: ${parsedPatchesResult.error.message}`,
        };
      }
      let patches = parsedPatchesResult.data;
      let patchOptions = patches.map(
        (patch, i): MultiSelectOptions<number>["options"][number] => {
          if (patch.type === "delete") {
            return { value: i, label: `DELETE ${patch.path}` };
          }
          if (patch.type === "add") {
            return { value: i, label: `ADD ${patch.path}` };
          }
          if (patch.type === "update") {
            return { value: i, label: `UPDATE ${patch.path}` };
          }
          if (patch.type === "move") {
            return { value: i, label: `MOVE ${patch.path} to ${patch.path}` };
          }
          patch satisfies never;
          shouldNeverHappen(`unexpected patch type ${JSON.stringify(patch)}`);
        },
      );

      // we want the user to decide which patch to apply
      // so we log the patch string here and then prompt for confirmation
      log.info(patchString);

      let firstResponse = await select({
        message: "Choose which patches to apply",
        options: [
          { value: "all", label: "All" },
          { value: "none", label: "None" },
          { value: "some", label: "Some" },
        ],
      });

      if (isCancel(firstResponse)) throw Error("user has canceled");

      if (firstResponse === "none") {
        return {
          ok: false,
          reason: "the user did not allow any of the patches.",
        };
      }

      let results = [];

      if (firstResponse === "some") {
        let response = await multiselect<number>({
          message: "Choose which patches to apply",
          options: patchOptions,
        });
        if (isCancel(response)) throw Error("user has canceled");
        patches = patches.filter((_, i) => {
          let keep = response.includes(i);
          if (!keep) {
            results.push({ ok: false, path: _.path, status: "user-denied" });
          }
          return keep;
        });
      }

      for (let patch of patches) {
        if (patch.type === "add") {
          let projectPath = ensureProjectPath(cwd, patch.path);
          await writeFile(projectPath, patch.content, { encoding: "utf-8" });
          results.push({ ok: true, path: patch.path, status: "add" });
          continue;
        }
        if (patch.type === "delete") {
          let projectPath = ensureProjectPath(cwd, patch.path);
          await unlink(projectPath);
          results.push({ ok: true, path: patch.path, status: "delete" });
          continue;
        }
        if (patch.type === "move") {
          let projectPathFrom = ensureProjectPath(cwd, patch.path);
          let projectPathTo = ensureProjectPath(cwd, patch.to);
          const dir = dirname(projectPathTo);
          await mkdir(dir, { recursive: true });
          await rename(projectPathFrom, projectPathTo);
          results.push({ ok: true, path: patch.path, status: "move" });
          continue;
        }
        if (patch.type === "update") {
          let projectPath = ensureProjectPath(cwd, patch.path);
          let content = await readFile(projectPath, { encoding: "utf-8" });
          let updatedContent = applyPatchToString(content, patch);
          if (updatedContent === null) {
            results.push({
              ok: false,
              path: patch.path,
              status: "update-failed",
            });
          } else {
            await writeFile(projectPath, updatedContent, { encoding: "utf-8" });
            results.push({
              ok: true,
              path: patch.path,
              status: "update-successful",
            });
          }

          continue;
        }
        shouldNeverHappen(`unexpected patch type ${JSON.stringify(patch)}`);
      }

      let ok = results.every((r) => r.ok);
      log.step(
        `write files: ${results
          .map((r) => `${r.path}:${r.status}`)
          .join(", ")}`,
      );
      return { ok, results };
    },
  });
}

type FilePatch =
  | {
      type: "add";
      path: string;
      content: string;
    }
  | {
      type: "delete";
      path: string;
    }
  | {
      type: "update";
      path: string;
      search: string;
      replace: string;
    }
  | {
      type: "move";
      path: string;
      to: string;
    };

/**
 * Parses a patch string and returns a list of patch objects.
 * @param patchString The patch string to parse.
 * @returns A list of patch objects.
 */
export function parsePatchString(patchString: string): Array<FilePatch> {
  let lines = patchString.split("\n");
  let patches: FilePatch[] = [];

  for (let i = 0; i < lines.length; ) {
    let line = lines[i]?.trim();
    if (line === undefined) break;

    if (line.startsWith("*** Add File:")) {
      let path = line.substring("*** Add File:".length).trim();
      i++;
      if (i >= lines.length || lines[i]?.trim() !== "<<< ADD") {
        i++; // consume the line
        continue;
      }
      i++;
      let contentLines: string[] = [];
      while (i < lines.length && lines[i]?.trim() !== ">>>") {
        contentLines.push(lines[i] ?? "");
        i++;
      }
      let content = contentLines.join("\n");
      patches.push({ type: "add", path: path, content: content });
      i++;
    } else if (line.startsWith("*** Delete File:")) {
      let path = line.substring("*** Delete File:".length).trim();
      patches.push({ type: "delete", path: path });
      i++;
    } else if (line.startsWith("*** Move File:")) {
      let path = line.substring("*** Move File:".length).trim();
      i++;
      if (i >= lines.length || lines[i]?.trim() !== "<<< TO") {
        i++; // consume the line
        continue;
      }
      i++;
      let toLines: string[] = [];
      while (i < lines.length && lines[i]?.trim() !== ">>>") {
        toLines.push(lines[i] ?? "");
        i++;
      }
      let to = toLines.join("\n");
      patches.push({
        type: "move",
        path: path,
        to: to,
      });
      i++;
    } else if (line.startsWith("*** Update File:")) {
      let path = line.substring("*** Update File:".length).trim();
      i++;
      if (i >= lines.length || lines[i]?.trim() !== "<<< SEARCH") {
        i++; // consume the line
        continue;
      }
      i++;
      let searchLines: string[] = [];
      while (i < lines.length && lines[i]?.trim() !== "===") {
        searchLines.push(lines[i] ?? "");
        i++;
      }
      let search = searchLines.join("\n");
      i++;
      let replaceLines: string[] = [];
      while (i < lines.length && lines[i]?.trim() !== ">>>") {
        replaceLines.push(lines[i] ?? "");
        i++;
      }
      let replace = replaceLines.join("\n");
      patches.push({
        type: "update",
        path: path,
        search: search,
        replace: replace,
      });
      i++;
    } else {
      i++; // Skip lines that don't match any known pattern
    }
  }

  let addFileCount = patchString
    .split("\n")
    .filter((line) => line.startsWith("*** Add File:")).length;
  let updateFileCount = patchString
    .split("\n")
    .filter((line) => line.startsWith("*** Update File:")).length;
  let deleteFileCount = patchString
    .split("\n")
    .filter((line) => line.startsWith("*** Delete File:")).length;
  let moveFileCount = patchString
    .split("\n")
    .filter((line) => line.startsWith("*** Move File:")).length;

  if (
    addFileCount + updateFileCount + deleteFileCount + moveFileCount !==
    patches.length
  ) {
    throw new Error(
      "The number of patch declarations does not match the number of parsed patches.",
    );
  }
  return patches;
}

/**
 * Applies a patch to a string, ensuring that the search and replace operations
 * are performed on full lines.
 * @param content The original content.
 * @param patch The patch to apply.
 * @returns The patched content, or null if the patch could not be applied.
 */
export function applyPatchToString(
  content: string,
  patch: Extract<FilePatch, { type: "update" }>,
): string | null {
  let contentLines = content.split("\n");
  let searchLines = patch.search.split("\n");
  let replaceLines = patch.replace.split("\n");

  let searchStart = -1;
  for (let i = 0; i <= contentLines.length - searchLines.length; i++) {
    let match = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (contentLines[i + j] !== searchLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      searchStart = i;
      break;
    }
  }

  if (searchStart === -1) {
    return null; // Patch cannot be applied because the search string was not found
  }

  let updatedContentLines = [
    ...contentLines.slice(0, searchStart),
    ...replaceLines,
    ...contentLines.slice(searchStart + searchLines.length),
  ];

  return updatedContentLines.join("\n");
}

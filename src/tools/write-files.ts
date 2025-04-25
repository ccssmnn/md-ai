import { readFile, unlink, writeFile } from "node:fs/promises";

import { z } from "zod";
import { tool } from "ai";

import { ensureProjectPath, confirm } from "./_shared.js";
import { log } from "@clack/prompts";
import { shouldNeverHappen } from "../utils.js";

export function createWriteFilesTool(options: { auto?: boolean; cwd: string }) {
  return tool({
    description: `This tool accepts a custom unified patch string for adding, deleting, or updating files.
The patch string should adhere to the following format:

"""
*** Add File: path/to/file.txt
<<< ADD
content
to
write
>>>
*** Delete File: path/to/file.txt
*** Update File: path/to/file.txt
<<< SEARCH
content
that
needs
the
update
===
content
that
got
the update
>>>
"""

Each patch starts with a line beginning with "***" followed by the operation type (Add File, Delete File, or Update File) and the file path.

- Add File: Includes the content to be added within the "<<< ADD" and ">>>" delimiters.
- Delete File: No additional content is needed after the file path.
- Update File: Requires a "<<< SEARCH" block containing the content to be replaced, followed by "===", and then a block containing the replacement content within the ">>>" delimiters.

For Update File operations, ensure the "<<< SEARCH" block includes sufficient surrounding lines to uniquely identify the content to be replaced, minimizing the risk of unintended changes.

You can have as many or as little patches as you like in this string.`,
    parameters: z.object({ patch: z.string() }),
    execute: async ({ patch: patchString }) => {
      let { cwd, auto = false } = options;
      let patches = parsePatchString(patchString);

      let allowSet: Set<number> | false = new Set(patches.map((_, i) => i));

      let summary = patches.map((patch, i) => {
        if (patch.type === "delete") return `${i + 1}: DELETE ${patch.path}`;
        if (patch.type === "add") return `${i + 1}: ADD ${patch.path}`;
        if (patch.type === "update") return `${i + 1}: UPDATE ${patch.path}`;
        shouldNeverHappen(`unexpected patch type ${patch}`);
      });

      log.info(patchString);
      if (!auto) allowSet = await confirm(summary);
      if (allowSet === false || allowSet.size === 0) {
        return { ok: false, error: "User denied write request" };
      }
      let allowedPatches = patches
        .map((f, i) => ({ ...f, idx: i }))
        .filter((f) => allowSet!.has(f.idx));

      let results: any[] = [];
      for (let patch of allowedPatches) {
        try {
          if (patch.type === "add") {
            let projectPath = ensureProjectPath(cwd, patch.path);
            await writeFile(projectPath, patch.content, {
              encoding: "utf-8",
            });
            results.push({
              ok: true,
              path: patch.path,
              status: "add" as const,
            });
          } else if (patch.type === "delete") {
            let projectPath = ensureProjectPath(cwd, patch.path);
            await unlink(projectPath);
            results.push({
              ok: true,
              path: patch.path,
              status: "delete" as const,
            });
          } else if (patch.type === "update") {
            let projectPath = ensureProjectPath(cwd, patch.path);
            let content = await readFile(projectPath, { encoding: "utf-8" });
            let updatedContent = applyPatchToString(content, patch);

            if (updatedContent === null) {
              results.push({
                ok: false,
                path: patch.path,
                status: "update-failed" as const,
                error: "Patch could not be applied",
              });
            } else {
              await writeFile(projectPath, updatedContent);
              results.push({
                ok: true,
                path: patch.path,
                status: "update" as const,
              });
            }
          } else {
            shouldNeverHappen(`unexpected patch type ${patch}`);
          }
        } catch (error: any) {
          results.push(error);
        }
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

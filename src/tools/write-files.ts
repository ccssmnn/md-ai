import {
  stat,
  readFile,
  unlink,
  writeFile,
  mkdir,
  rename,
} from "node:fs/promises";
import { dirname } from "node:path";

import { z } from "zod";
import { tool } from "ai";
import { isCancel, log, multiselect, select } from "@clack/prompts";
import type { MultiSelectOptions } from "@clack/prompts";

import { ensureProjectPath } from "./_shared.js";
import { shouldNeverHappen, tryCatch } from "../utils.js";

const filePatchSchema = z.union([
  z.object({
    type: z.literal("add"),
    path: z.string(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("delete"),
    path: z.string(),
  }),
  z.object({
    type: z.literal("update"),
    path: z.string(),
    search: z.string(),
    replace: z.string(),
  }),
  z.object({
    type: z.literal("move"),
    path: z.string(),
    to: z.string(),
  }),
]);

const writeFilesParameters = z.object({
  patches: z.array(filePatchSchema),
});

export function createWriteFilesTool(options: { cwd: string }) {
  return tool({
    description: `Applies a series of file modifications based on a JSON array of patch objects.

The input should be a JSON array where each element is an object representing a file operation. The possible operations are:

1. Add File:
   {
     "type": "add",
     "path": "<relative/path/to/file>",
     "content": "<new file content>"
   }

2. Delete File:
   {
     "type": "delete",
     "path": "<relative/path/to/file>"
   }

3. Update File:
   {
     "type": "update",
     "path": "<relative/path/to/file>",
     "search": "<existing lines to replace>",
     "replace": "<replacement lines>"
   }

   Note: The tool ignores leading/trailing whitespace and indentation when matching the 'search' pattern. It will replace *all* occurrences of the matched pattern globally within the file. To update only a specific occurrence, include enough surrounding lines in the 'search' parameter to make that specific occurrence unique.

4. Move File:
   {
     "type": "move",
     "path": "<relative/path/from>",
     "to": "<relative/path/to>"
   }

The tool will present the proposed changes to the user for confirmation before applying them.
`,
    parameters: writeFilesParameters,
    execute: async ({ patches }) => {
      // we want the user to decide which patch to apply
      // so we log the patch here and then prompt for confirmation
      log.info(
        patches
          .map((p) => {
            switch (p.type) {
              case "add":
                return [
                  `*** Add File: ${p.path}`,
                  "<<< ADD",
                  p.content,
                  ">>>",
                ].join("\n");
              case "delete":
                return `*** Delete File: ${p.path}`;
              case "move":
                return [`*** Move File: ${p.path}`, "<<< TO", p.to, ">>>"].join(
                  "\n",
                );
              case "update":
                return [
                  `*** Update File: ${p.path}`,
                  "<<< SEARCH",
                  p.search,
                  "===",
                  p.replace,
                  ">>>",
                ].join("\n");
              default:
                p satisfies never;
            }
          })
          .join("\n"),
      );

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
          reason:
            "the user did not allow any of the patches. ask the user why before trying again.",
        };
      }

      let results = [];

      if (firstResponse === "some") {
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
              return { value: i, label: `MOVE ${patch.path} to ${patch.to}` };
            }
            patch satisfies never;
            shouldNeverHappen(`unexpected patch type ${JSON.stringify(patch)}`);
          },
        );
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

      let { cwd } = options;
      for (let patch of patches) {
        if (patch.type === "add") {
          let projectPath = ensureProjectPath(cwd, patch.path);
          let fileExists = await tryCatch(stat(projectPath));
          if (fileExists.ok) {
            results.push({
              ok: false,
              path: patch.path,
              status: "add-failed",
              reason: "file already exists",
            });
            continue;
          } else {
            await writeFile(projectPath, patch.content, { encoding: "utf-8" });
            results.push({ ok: true, path: patch.path, status: "add" });
            continue;
          }
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
          let dir = dirname(projectPathTo);
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

  // Normalize lines by trimming whitespace for comparison
  const normalizeLine = (line: string) => line.trim();

  let normalizedContentLines = contentLines.map(normalizeLine);
  let normalizedSearchLines = searchLines.map(normalizeLine);

  if (normalizedSearchLines.length === 0) {
    return null;
  }

  const matchStarts: number[] = [];
  for (
    let i = 0;
    i <= normalizedContentLines.length - normalizedSearchLines.length;
    i++
  ) {
    let match = true;
    for (let j = 0; j < normalizedSearchLines.length; j++) {
      if (normalizedContentLines[i + j] !== normalizedSearchLines[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      matchStarts.push(i);
    }
  }

  if (matchStarts.length === 0) {
    return null;
  }

  // Apply patches from the end to avoid index issues
  let updatedContentLines = [...contentLines];
  for (let k = matchStarts.length - 1; k >= 0; k--) {
    const searchStart = matchStarts.at(k);
    if (searchStart === undefined) {
      return shouldNeverHappen(
        `matchStarts.at(k) is undefined: ${matchStarts}.at(${k})`,
      );
    }
    updatedContentLines.splice(
      searchStart,
      searchLines.length,
      ...replaceLines,
    );
  }

  return updatedContentLines.join("\n");
}

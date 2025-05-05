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
   Creates a new file. Fails if the file already exists.

2. Delete File:
   {
     "type": "delete",
     "path": "<relative/path/to/file>"
   }
   Deletes an existing file. Fails if the file does not exist.

3. Update File:
   {
     "type": "update",
     "path": "<relative/path/to/file>",
     "search": "<existing lines to replace>",
     "replace": "<replacement lines>"
   }
   Modifies an existing file by replacing occurrences of 'search' content with 'replace' content. Fails if the file does not exist or if the 'search' pattern is not found.
   Note: The tool ignores leading/trailing whitespace and indentation when matching the 'search' pattern. It will replace *all* occurrences of the matched pattern globally within the file. To update only a specific occurrence, include enough surrounding lines in the 'search' parameter to make that specific occurrence unique.

4. Move File:
   {
     "type": "move",
     "path": "<relative/path/from>",
     "to": "<relative/path/to>"
   }
   Moves a file from one location to another. Fails if the file does not exist.

5. Replace File:
   {
     "type": "replace",
     "path": "<relative/path/to/file>",
     "content": "<new file content>"
   }
   Replaces the entire content of an existing file. Fails if the file does not exist.
   Note: For large file modifications, using the 'replace' type is generally more efficient and reliable than using multiple or a single large 'update' patch.

The tool will present the proposed changes to the user for confirmation before applying them.
`,
    parameters: writeFilesParameters,
    execute: async ({ patches }) => {
      log.step("write files: the model wants to make the changes");
      log.info(patchesToDiffString(patches));

      let patchesToAllow = await askWhichPatchesToAllow(patches);
      if (patchesToAllow.type === "none") {
        return {
          ok: false,
          status: "user-denied",
          reason: "the user did not allow any of the patches. ask them why.",
        };
      }

      let { cwd } = options;
      let results = await Promise.all(
        patches.map((patch, i) => {
          if (
            patchesToAllow.type === "some" &&
            !patchesToAllow.allowedPatchIDs.includes(i)
          ) {
            return {
              ok: false,
              path: patch.path,
              status: "user-denied",
              reason: "user decided to not allow this patch. ask them why.",
            };
          }
          switch (patch.type) {
            case "add":
              return applyAddPatch(patch, cwd);
            case "delete":
              return applyDeletePatch(patch, cwd);
            case "move":
              return applyMovePatch(patch, cwd);
            case "update":
              return applyUpdatePatch(patch, cwd);
            case "replace":
              return applyReplacePatch(patch, cwd);
            default:
              patch satisfies never;
              shouldNeverHappen(
                `unexpected patch type ${JSON.stringify(patch)}`,
              );
          }
        }),
      );

      let ok = results.every((r) => r.ok);
      let summary = results.map((r) => `${r.path}:${r.status}`).join(", ");
      log.step(`write files: ${summary}`);
      return { ok, results };
    },
  });
}

let filePatchSchema = z.union([
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
  z.object({
    type: z.literal("replace"),
    path: z.string(),
    content: z.string(),
  }),
]);

type FilePatch = z.infer<typeof filePatchSchema>;

let writeFilesParameters = z.object({
  patches: z.array(filePatchSchema),
});

function patchesToDiffString(patches: Array<FilePatch>) {
  return patches
    .map((p) => {
      switch (p.type) {
        case "add":
          return [`*** Add File: ${p.path}`, "<<< ADD", p.content, ">>>"].join(
            "\n",
          );
        case "delete":
          return `*** Delete File: ${p.path}`;
        case "move":
          return [`*** Move File: ${p.path}`, "<<< TO", p.to, ">>>"].join("\n");
        case "update":
          return [
            `*** Update File: ${p.path}`,
            "<<< SEARCH",
            p.search,
            "===",
            p.replace,
            ">>>",
          ].join("\n");
        case "replace":
          return [
            `*** Replace File: ${p.path}`,
            "<<< REPLACE WITH",
            p.content,
            ">>>",
          ].join("\n");
        default:
          p satisfies never;
      }
    })
    .join("\n");
}

async function askWhichPatchesToAllow(patches: Array<FilePatch>) {
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
    return { type: "none" as const };
  }
  if (firstResponse === "all") {
    return { type: "all" as const };
  }

  let patchOptions = patches.map(
    (patch, i): MultiSelectOptions<number>["options"][number] => {
      switch (patch.type) {
        case "delete":
          return { value: i, label: `DELETE ${patch.path}` };
        case "add":
          return { value: i, label: `ADD ${patch.path}` };
        case "update":
          return { value: i, label: `UPDATE ${patch.path}` };
        case "move":
          return { value: i, label: `MOVE ${patch.path} to ${patch.to}` };
        case "replace":
          return { value: i, label: `REPLACE ${patch.path}` };
        default:
          patch satisfies never;
          shouldNeverHappen(`unexpected patch type ${JSON.stringify(patch)}`);
      }
    },
  );
  let response = await multiselect<number>({
    message: "Choose which patches to apply",
    options: patchOptions,
  });
  if (isCancel(response)) throw Error("user has canceled");
  return { type: "some" as const, allowedPatchIDs: response };
}

type PatchResult = {
  ok: boolean;
  path: string;
  status: string;
  reason?: string;
};

async function applyAddPatch(
  patch: Extract<FilePatch, { type: "add" }>,
  cwd: string,
): Promise<PatchResult> {
  let projectPath = ensureProjectPath(cwd, patch.path);
  let writeRes = await tryCatch(
    writeFile(projectPath, patch.content, {
      encoding: "utf-8",
      flag: "wx", // write but fail if the path exists
    }),
  );
  if (!writeRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "add-failed",
      reason: "file already exists",
    };
  }
  return { ok: true, path: patch.path, status: "add" };
}

async function applyDeletePatch(
  patch: Extract<FilePatch, { type: "delete" }>,
  cwd: string,
): Promise<PatchResult> {
  let projectPath = ensureProjectPath(cwd, patch.path);
  let unlinkRes = await tryCatch(unlink(projectPath));
  if (!unlinkRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "delete-failed",
      reason: `failed to delete file ${patch.path}: ${unlinkRes.error}`,
    };
  }
  return { ok: true, path: patch.path, status: "delete" };
}

async function applyMovePatch(
  patch: Extract<FilePatch, { type: "move" }>,
  cwd: string,
): Promise<PatchResult> {
  let projectPathFrom = ensureProjectPath(cwd, patch.path);
  let projectPathTo = ensureProjectPath(cwd, patch.to);
  let dir = dirname(projectPathTo);
  let mkdirRes = await tryCatch(mkdir(dir, { recursive: true }));
  if (!mkdirRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "move-failed",
      reason: `failed to create directory ${dir}: ${mkdirRes.error}`,
    };
  }
  let renameRes = await tryCatch(rename(projectPathFrom, projectPathTo));
  if (!renameRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "move-failed",
      reason: `failed to move file from ${patch.path} to ${patch.to}: ${renameRes.error}`,
    };
  }
  return { ok: true, path: patch.path, status: "move" };
}

async function applyUpdatePatch(
  patch: Extract<FilePatch, { type: "update" }>,
  cwd: string,
): Promise<PatchResult> {
  let projectPath = ensureProjectPath(cwd, patch.path);
  let contentRes = await tryCatch(readFile(projectPath, { encoding: "utf-8" }));
  if (!contentRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "update-failed",
      reason: `failed to read file ${patch.path}: ${contentRes.error}`,
    };
  }

  let updatedContentRes = tryCatch(() =>
    applyPatchToString(contentRes.data, patch),
  );
  if (!updatedContentRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "update-failed",
      reason: updatedContentRes.error.message,
    };
  }

  let writeFileRes = await tryCatch(
    writeFile(projectPath, updatedContentRes.data, {
      encoding: "utf-8",
    }),
  );
  if (!writeFileRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "update-failed",
      reason: `failed to write update result: ${writeFileRes.error}`,
    };
  }
  return {
    ok: true,
    path: patch.path,
    status: "update-successful",
  };
}

async function applyReplacePatch(
  patch: Extract<FilePatch, { type: "replace" }>,
  cwd: string,
): Promise<PatchResult> {
  let projectPath = ensureProjectPath(cwd, patch.path);
  let fileExists = await tryCatch(stat(projectPath));
  if (!fileExists.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "replace-failed",
      reason: "file not found",
    };
  }
  let writeRes = await tryCatch(
    writeFile(projectPath, patch.content, { encoding: "utf-8" }),
  );
  if (!writeRes.ok) {
    return {
      ok: false,
      path: patch.path,
      status: "replace-failed",
      reason: `failed to write file ${patch.path}: ${writeRes.error}`,
    };
  }
  return { ok: true, path: patch.path, status: "replace" };
}

/**
 * Applies a patch to a string, ensuring that the search and replace operations
 * are performed on full lines.
 * @param content The original content.
 * @param patch The patch to apply.
 * @returns The patched content, or null if the patch could not be applied.
 * @throws a string if the patch could not be applied
 */
export function applyPatchToString(
  content: string,
  patch: Extract<FilePatch, { type: "update" }>,
): string {
  let contentLines = content.split("\n");
  let searchLines = patch.search.split("\n");
  let replaceLines = patch.replace.split("\n");

  // Normalize lines by trimming whitespace for comparison
  let normalizeLine = (line: string) => line.trim();

  let normalizedContentLines = contentLines.map(normalizeLine);
  let normalizedSearchLines = searchLines.map(normalizeLine);

  if (normalizedSearchLines.length === 0) {
    throw new Error("search lines is empty");
  }

  let matchStarts: number[] = [];
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
    throw new Error("did not find a match for the search lines");
  }

  // Apply patches from the end to avoid index issues
  let updatedContentLines = [...contentLines];
  for (let k = matchStarts.length - 1; k >= 0; k--) {
    let searchStart = matchStarts.at(k);
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

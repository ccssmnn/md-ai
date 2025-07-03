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
import { isCancel, log, select, text } from "@clack/prompts";

import {
  ensureProjectPath,
  checkFileVersion,
  trackFileAccess,
} from "./_shared.js";
import { shouldNeverHappen, tryCatch } from "../utils/index.js";
import { maybeAutoMode } from "./_shared.js";

export function createWriteFileTool(options: {
  cwd: string;
  auto: boolean;
  autoTimeout: number;
}) {
  return tool({
    description: `Applies a single file modification based on a JSON patch object.

The input should be a JSON object representing a file operation. The possible operations are:

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

The tool will present the proposed change to the user for confirmation before applying it.

IMPORTANT: After successfully applying file changes, you should inspect the codebase to determine what formatting, linting, and compilation checks are appropriate, then run them:

1. **Inspect the project structure** to identify the technology stack:
   - Look for package.json (Node.js/JavaScript/TypeScript)
   - Look for Cargo.toml (Rust)
   - Look for go.mod (Go)
   - Look for pyproject.toml, setup.py, requirements.txt (Python)
   - Look for Makefile, composer.json, etc.

2. **Check for existing scripts and tools**:
   - In package.json: look for "scripts" section (format, lint, type-check, test, etc.)
   - In Makefile: look for formatting/linting targets
   - In pyproject.toml: look for tool configurations (black, ruff, mypy, etc.)
   - Look for configuration files (.eslintrc, .prettierrc, tox.ini, etc.)

3. **Run appropriate checks based on what you find**:
   - **Formatting**: prettier, black, cargo fmt, go fmt, etc.
   - **Linting**: eslint, ruff, cargo clippy, golangci-lint, flake8, etc.
   - **Type checking**: tsc, mypy, cargo check, go build, etc.
   - **Testing**: npm test, cargo test, go test, pytest, etc.

Use the execCommand tool to run these checks. Always prefer using existing project scripts (e.g., "npm run lint") over direct tool invocation when available.
`,
    parameters: writeFilesParameters,
    execute: async ({ patch }) => {
      log.step("write files: the model wants to make the changes");
      log.info(patchToDiffString(patch));

      let fileToModify =
        patch.type === "update" || patch.type === "replace"
          ? ensureProjectPath(options.cwd, patch.path)
          : undefined;

      if (fileToModify) {
        let { isOutdated } = await checkFileVersion(fileToModify);
        if (isOutdated) {
          log.warning(
            `write files: file outdated. the model needs to re-read the file before making changes: ${fileToModify}`,
          );
          return {
            ok: false,
            status: "file-outdated",
            reason: `The file you want to modify is outdated. Re-read it before applying changes.`,
          };
        }
      }

      let patchToAllow: { type: "allow" } | { type: "deny"; reason?: string };

      if (
        await maybeAutoMode({
          auto: options.auto,
          autoTimeout: options.autoTimeout,
        })
      ) {
        patchToAllow = { type: "allow" } as const;
      } else {
        patchToAllow = await askWhichPatchToAllow(patch);
      }

      if (patchToAllow.type === "deny") {
        return {
          ok: false,
          status: "user-denied",
          reason:
            patchToAllow.reason ||
            "the user did not allow the patch. ask them why.",
        };
      }

      let { cwd } = options;

      const result = await applyPatch(patch, cwd);

      if (result.ok) {
        const modifiedFilePath = ensureProjectPath(
          cwd,
          patch.type === "move" ? patch.to : patch.path,
        );
        const statRes = await tryCatch(stat(modifiedFilePath));
        if (statRes.ok) {
          trackFileAccess(modifiedFilePath, statRes.data.mtimeMs);
        }
      }

      log.step(`write file: ${result.path}:${result.status}`);
      return { ok: result.ok, result };
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
  patch: filePatchSchema,
});

function patchToDiffString(patch: FilePatch): string {
  if (patch.type === "add") {
    return [
      `*** Add File: ${patch.path}`,
      "<<< ADD",
      patch.content,
      ">>>",
    ].join("\n");
  }
  if (patch.type === "delete") {
    return `*** Delete File: ${patch.path}`;
  }
  if (patch.type === "move") {
    return [`*** Move File: ${patch.path}`, "<<< TO", patch.to, ">>>"].join(
      "\n",
    );
  }
  if (patch.type === "update") {
    return [
      `*** Update File: ${patch.path}`,
      "<<< SEARCH",
      patch.search,
      "===",
      patch.replace,
      ">>>",
    ].join("\n");
  }
  if (patch.type === "replace") {
    return [
      `*** Replace File: ${patch.path}`,
      "<<< REPLACE WITH",
      patch.content,
      ">>>",
    ].join("\n");
  }

  patch satisfies never;
  return shouldNeverHappen(`unexpected patch type ${JSON.stringify(patch)}`);
}

async function askWhichPatchToAllow(
  patch: FilePatch,
): Promise<{ type: "allow" } | { type: "deny"; reason?: string }> {
  let patchLabel: string;
  switch (patch.type) {
    case "delete":
      patchLabel = `DELETE ${patch.path}`;
      break;
    case "add":
      patchLabel = `ADD ${patch.path}`;
      break;
    case "update":
      patchLabel = `UPDATE ${patch.path}`;
      break;
    case "move":
      patchLabel = `MOVE ${patch.path} to ${patch.to}`;
      break;
    case "replace":
      patchLabel = `REPLACE ${patch.path}`;
      break;
    default:
      patch satisfies never;
      shouldNeverHappen(`unexpected patch type ${JSON.stringify(patch)}`);
  }

  let response = await select({
    message: `Apply this patch: ${patchLabel}?`,
    options: [
      { value: "allow", label: "Yes" },
      { value: "deny", label: "No" },
    ],
  });

  if (isCancel(response)) throw Error("user has canceled");

  if (response === "deny") {
    let reason = await text({
      message: "Why are you denying this patch? (optional)",
      placeholder: "Enter reason or press Enter to skip",
    });
    if (isCancel(reason)) throw Error("user has canceled");
    return { type: "deny" as const, reason: reason || undefined };
  }

  return { type: "allow" as const };
}

type PatchResult = {
  ok: boolean;
  path: string;
  status: string;
  reason?: string;
};

async function applyPatch(patch: FilePatch, cwd: string) {
  switch (patch.type) {
    case "add":
      return await applyAddPatch(patch, cwd);
    case "delete":
      return await applyDeletePatch(patch, cwd);
    case "move":
      return await applyMovePatch(patch, cwd);
    case "update":
      return await applyUpdatePatch(patch, cwd);
    case "replace":
      return await applyReplacePatch(patch, cwd);
    default:
      patch satisfies never;
      shouldNeverHappen(`unexpected patch type ${JSON.stringify(patch)}`);
  }
}

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

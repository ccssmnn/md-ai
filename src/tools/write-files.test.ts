import assert from "node:assert";
import test from "node:test";

import { parsePatchString, applyPatchToString } from "#/tools/write-files.js";

test("parsePatchString", async (t) => {
  await t.test("should parse an add patch", () => {
    let patchString = `*** Add File: src/newFile.txt
<<< ADD
This is the content of the new file.
>>>`;
    let patches = parsePatchString(patchString);
    assert.deepStrictEqual(patches, [
      {
        type: "add",
        path: "src/newFile.txt",
        content: "This is the content of the new file.",
      },
    ]);
  });

  await t.test("should parse a delete patch", () => {
    let patchString = `*** Delete File: src/deletedFile.txt`;
    let patches = parsePatchString(patchString);
    assert.deepStrictEqual(patches, [
      {
        type: "delete",
        path: "src/deletedFile.txt",
      },
    ]);
  });

  await t.test("should parse an update patch", () => {
    let patchString = `*** Update File: src/updatedFile.txt
<<< SEARCH
old content
===
new content
>>>`;
    let patches = parsePatchString(patchString);
    assert.deepStrictEqual(patches, [
      {
        type: "update",
        path: "src/updatedFile.txt",
        search: "old content",
        replace: "new content",
      },
    ]);
  });

  await t.test("should parse multiple patches", () => {
    let patchString = `*** Add File: src/newFile.txt
<<< ADD
This is the content of the new file.
>>>
*** Delete File: src/deletedFile.txt
*** Update File: src/updatedFile.txt
<<< SEARCH
old content
===
new content
>>>`;
    let patches = parsePatchString(patchString);
    assert.deepStrictEqual(patches, [
      {
        type: "add",
        path: "src/newFile.txt",
        content: "This is the content of the new file.",
      },
      {
        type: "delete",
        path: "src/deletedFile.txt",
      },
      {
        type: "update",
        path: "src/updatedFile.txt",
        search: "old content",
        replace: "new content",
      },
    ]);
  });

  await t.test("should parse a move patch", () => {
    let patchString = `*** Move File: src/oldFile.txt\n<<< TO\nsrc/newFile.txt\n>>>`;
    let patches = parsePatchString(patchString);
    assert.deepStrictEqual(patches, [
      {
        type: "move",
        path: "src/oldFile.txt",
        to: "src/newFile.txt",
      },
    ]);
  });
});

test("applyPatchToString", async (t) => {
  await t.test(
    "should apply an update patch when the search string matches a full line",
    () => {
      let originalContent = "This is the old content.";
      let patch = {
        type: "update",
        path: "src/file.txt",
        search: "This is the old content.",
        replace: "This is the new content.",
      } as const;
      let newContent = applyPatchToString(originalContent, patch);
      assert.strictEqual(newContent, "This is the new content.");
    },
  );

  await t.test("should return null if the search string is not found", () => {
    let originalContent = "This is some content.";
    let patch = {
      type: "update",
      path: "src/file.txt",
      search: "This is the old content.",
      replace: "This is the new content.",
    } as const;
    let newContent = applyPatchToString(originalContent, patch);
    assert.strictEqual(newContent, null);
  });

  await t.test("should apply an update patch with multiline content", () => {
    let originalContent = `This is the first line.
This is the old content.
This is the last line.`;
    let patch = {
      type: "update",
      path: "src/file.txt",
      search: "This is the old content.",
      replace: "This is the new content.",
    } as const;
    let newContent = applyPatchToString(originalContent, patch);
    assert.strictEqual(
      newContent,
      `This is the first line.
This is the new content.
This is the last line.`,
    );
  });

  await t.test(
    "should apply a complex update patch with multiline content and context",
    () => {
      let originalContent = `export function add(a: number, b: number) {
  return a + b;
}

export function subtract(a: number, b: number) {
  return a - b;
}`;
      let patch1 = {
        type: "update",
        path: "src/math.ts",
        search: `export function add(a: number, b: number) {
  return a + b;
}`,
        replace: `export function add(a: number, b: number) {
  return b + a;
}`,
      } as const;
      originalContent = applyPatchToString(originalContent, patch1)!;
      let patch2 = {
        type: "update",
        path: "src/math.ts",
        search: `export function subtract(a: number, b: number) {
  return a - b;
}`,
        replace: `export function subtract(a: number, b: number) {
  return b - a;
}`,
      } as const;
      let newContent = applyPatchToString(originalContent, patch2);
      assert.strictEqual(
        newContent,
        `export function add(a: number, b: number) {
  return b + a;
}

export function subtract(a: number, b: number) {
  return b - a;
}`,
      );
    },
  );
});

import assert from "node:assert";
import test from "node:test";

import { applyPatchToString } from "./write-files.js";

test("tools: write-files: applyPatchToString", async (t) => {
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

  await t.test(
    "should throw an error if the search string is not found",
    () => {
      let originalContent = "This is some content.";
      let patch = {
        type: "update",
        path: "src/file.txt",
        search: "This is the old content.",
        replace: "This is the new content.",
      } as const;
      assert.throws(() => applyPatchToString(originalContent, patch));
    },
  );

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

  await t.test(
    "should apply an update patch ignoring leading/trailing whitespace and indentation",
    () => {
      let originalContent = `Line 1\n  Line 2 with indent\nLine 3`;
      let patch = {
        type: "update",
        path: "src/file.txt",
        search: "Line 2 with indent",
        replace: "Updated Line 2",
      } as const;
      let newContent = applyPatchToString(originalContent, patch);
      assert.strictEqual(newContent, `Line 1\nUpdated Line 2\nLine 3`);
    },
  );

  await t.test("should apply an update patch replacing all occurrences", () => {
    let originalContent = `This is line one.\nThis is a line to replace.\nThis is line three.\nAnother line to replace here.\nThis is the last line.`;
    let patch = {
      type: "update",
      path: "src/file.txt",
      search: "This is a line to replace.",
      replace: "This line has been replaced.",
    } as const;
    let newContent = applyPatchToString(originalContent, patch);
    assert.strictEqual(
      newContent,
      `This is line one.\nThis line has been replaced.\nThis is line three.\nAnother line to replace here.\nThis is the last line.`.replace(
        /This is a line to replace\./g,
        "This line has been replaced.",
      ),
    );
  });

  await t.test(
    "should apply an update patch when the search string is at the beginning",
    () => {
      let originalContent = `Line 1\nLine 2\nLine 3`;
      let patch = {
        type: "update",
        path: "src/file.txt",
        search: "Line 1",
        replace: "Updated Line 1",
      } as const;
      let newContent = applyPatchToString(originalContent, patch);
      assert.strictEqual(newContent, `Updated Line 1\nLine 2\nLine 3`);
    },
  );

  await t.test(
    "should apply an update patch when the search string is at the end",
    () => {
      let originalContent = `Line 1\nLine 2\nLine 3`;
      let patch = {
        type: "update",
        path: "src/file.txt",
        search: "Line 3",
        replace: "Updated Line 3",
      } as const;
      let newContent = applyPatchToString(originalContent, patch);
      assert.strictEqual(newContent, `Line 1\nLine 2\nUpdated Line 3`);
    },
  );

  await t.test("should throw an error if the search string is empty", () => {
    let originalContent = "Some content.";
    let patch = {
      type: "update",
      path: "src/file.txt",
      search: "",
      replace: "Replacement",
    } as const;
    assert.throws(() => applyPatchToString(originalContent, patch));
  });

  await t.test("with multiple matches", () => {
    let originalContentMultiline = `Line 1\nSearchLine\nSearchLine\nLine 4`;
    let patchMultiline = {
      type: "update",
      path: "src/file.txt",
      search: "SearchLine",
      replace: "SearchLine\nNewLine",
    } as const;
    let expectedContentMultiline = `Line 1\nSearchLine\nNewLine\nSearchLine\nNewLine\nLine 4`;
    let newContentMultiline = applyPatchToString(
      originalContentMultiline,
      patchMultiline,
    );
    assert.strictEqual(newContentMultiline, expectedContentMultiline);
  });
});

import assert from "node:assert";
import { resolve } from "node:path";
import test from "node:test";

import { ensureProjectPath, parseGitignore } from "../../src/tools/_shared.js";

test("tools: _shared: parseGitignore", async (t) => {
  await t.test("should return an empty array for empty content", () => {
    assert.deepStrictEqual(parseGitignore(""), []);
  });

  await t.test("should ignore comments and empty lines", () => {
    let content = `
# This is a comment

  file.txt  
# Another comment
    dir/
`;
    assert.deepStrictEqual(parseGitignore(content), [
      "**/file.txt",
      "**/dir",
      "**/dir/**",
    ]);
  });

  await t.test("should handle basic file patterns", () => {
    let content = `
file.txt
*.log
`;
    assert.deepStrictEqual(parseGitignore(content), [
      "**/file.txt",
      "**/*.log",
    ]);
  });

  await t.test("should handle negated patterns", () => {
    let content = `
!important.txt
!dir/
`;
    assert.deepStrictEqual(parseGitignore(content), [
      "!**/important.txt",
      "!**/dir",
      "!**/dir/**",
    ]);
  });

  await t.test("should handle anchored patterns", () => {
    let content = `
/root_file.txt
/root_dir/
`;
    assert.deepStrictEqual(parseGitignore(content), [
      "root_file.txt",
      "root_dir",
      "root_dir/**",
    ]);
  });

  await t.test("should handle a mix of patterns", () => {
    let content = `
# Ignore build directory
/build/

# Ignore log files anywhere
*.log

# But not this specific log file
!/path/to/keep.log

# Ignore a specific file in the root
/config.json
`;
    assert.deepStrictEqual(parseGitignore(content), [
      "build",
      "build/**",
      "**/*.log",
      "!path/to/keep.log",
      "config.json",
    ]);
  });

  await t.test(
    "should handle directory patterns without trailing slash but no stars or dots",
    () => {
      let content = `
temp
`;
      assert.deepStrictEqual(parseGitignore(content), [
        "**/temp",
        "**/temp/**",
      ]);
    },
  );

  await t.test(
    "should handle patterns with dots but no stars as file patterns",
    () => {
      let content = `
file.with.dots
`;
      assert.deepStrictEqual(parseGitignore(content), ["**/file.with.dots"]);
    },
  );
});

test("tools: _shared: ensureProjectPath", async (t) => {
  await t.test("should return absolute path for valid relative path", () => {
    let root = resolve("/app/project");
    let result = ensureProjectPath(root, "src/index.ts");
    assert.strictEqual(result, resolve(root, "src/index.ts"));
  });

  await t.test("should throw error for path escaping root via ..", () => {
    let root = resolve("/app/project");
    assert.throws(
      () => ensureProjectPath(root, "../outside.txt"),
      /Path outside project root/,
    );
  });

  await t.test(
    "should throw error for sibling directory with matching prefix",
    () => {
      let root = resolve("/app/project");
      let evilSibling = resolve("/app/project-evil/file.txt");
      assert.throws(
        () => ensureProjectPath(root, evilSibling),
        /Path outside project root/,
      );
    },
  );
});

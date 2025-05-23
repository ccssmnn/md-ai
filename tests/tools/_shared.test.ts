import assert from "node:assert";
import test from "node:test";

import { parseGitignore } from "../../src/tools/_shared.js";

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

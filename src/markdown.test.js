import { test } from "node:test";
import assert from "node:assert/strict";
import { markdownToMessages } from "./markdown.js";

/**
 * @typedef {import("ai").CoreMessage} CoreMessage
 */

test("extracts a single user message", () => {
  const markdown = `## user
Hello there.`;

  const result = markdownToMessages(markdown);
  assert.deepEqual(result, [{ role: "user", content: "Hello there." }]);
});

test("extracts a user and assistant message", () => {
  const markdown = `## user
Hello.

## assistant
Hi! How can I help?`;

  const result = markdownToMessages(markdown);
  assert.deepEqual(result, [
    { role: "user", content: "Hello." },
    { role: "assistant", content: "Hi! How can I help?" },
  ]);
});

test("ignores trailing heading with no content", () => {
  const markdown = `## user
Hi there.

## assistant
Hello.

## user`;

  const result = markdownToMessages(markdown);
  assert.deepEqual(result, [
    { role: "user", content: "Hi there." },
    { role: "assistant", content: "Hello." },
  ]);
});

test("handles multiple lines per message", () => {
  const markdown = `## user
Line one
Line two

## assistant
Line A
Line B`;

  const result = markdownToMessages(markdown);
  assert.deepEqual(result, [
    { role: "user", content: "Line one\nLine two" },
    { role: "assistant", content: "Line A\nLine B" },
  ]);
});

test("is case-insensitive and trims headings", () => {
  const markdown = `## USER  \n 
How are you?

## Assistant   \n
I'm fine.`;

  const result = markdownToMessages(markdown);
  assert.deepEqual(result, [
    { role: "user", content: "How are you?" },
    { role: "assistant", content: "I'm fine." },
  ]);
});

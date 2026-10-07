import assert from "node:assert/strict";
import { test } from "node:test";
import { toProse } from "./prose.ts";

test("top-level items become one paragraph; notes and nested items go", () => {
  const input = [
    "# Trip",
    "- We sailed at dawn [check the date]",
    "  - wind was 15 kt",
    "  - Pip was seasick",
    "- Reached the island by noon",
  ].join("\n");
  assert.equal(toProse(input), "# Trip\n\nWe sailed at dawn. Reached the island by noon.");
});

test("existing punctuation is kept, links lose their target too", () => {
  const input = "- Really? [doubtful]\n- See [the log](http://x) for more\n- Done!";
  assert.equal(toProse(input), "Really? See for more. Done!");
});

test("a blank line inside a list keeps the paragraph together", () => {
  const input = "- One\n\n- Two\n\nA closing line.";
  assert.equal(toProse(input), "One. Two.\n\nA closing line.");
});

test("continuation lines of nested items are dropped", () => {
  const input = "- Main point\n  - note that goes on\n    for a while\n- Second point";
  assert.equal(toProse(input), "Main point. Second point.");
});

test("numbered lists, nested deeper, and headings with notes", () => {
  const input = "## Plan [draft]\n1. First\n   1. detail\n2. Second\n\nThen prose.";
  assert.equal(toProse(input), "## Plan\n\nFirst. Second.\n\nThen prose.");
});

test("fenced code is kept as it is", () => {
  const input = "- Item\n\n```\n- not a list [x]\n```";
  assert.equal(toProse(input), "Item.\n\n```\n- not a list [x]\n```");
});

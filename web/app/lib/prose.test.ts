import assert from "node:assert/strict";
import { test } from "node:test";
import { toProse } from "./prose.ts";

test("a list becomes one paragraph, nested items included, notes dropped", () => {
  const input = [
    "# Trip",
    "- We sailed at dawn [check the date]",
    "  - wind was 15 kt",
    "  - Pip was seasick",
    "- Reached the island by noon",
  ].join("\n");
  assert.equal(
    toProse(input),
    "# Trip\n\nWe sailed at dawn. Wind was 15 kt. Pip was seasick. Reached the island by noon.",
  );
});

test("existing punctuation is kept, links lose their target too", () => {
  const input = "- Really? [doubtful]\n- See [the log](http://x) for more\n- Done!";
  assert.equal(toProse(input), "Really? See for more. Done!");
});

test("a blank line separates lists into paragraphs", () => {
  const input = "- One\n- Two\n\n- Three\n  - Four\n\nA closing line.";
  assert.equal(toProse(input), "One. Two.\n\nThree. Four.\n\nA closing line.");
});

test("an indented continuation line belongs to its item", () => {
  const input = "- Main point\n  - a note that goes on\n    for a while\n- Second point";
  assert.equal(toProse(input), "Main point. A note that goes on for a while. Second point.");
});

test("numbered lists, nested deeper, and headings with notes", () => {
  const input = "## Plan [draft]\n1. First\n   1. Detail\n2. Second\n\nThen prose.";
  assert.equal(toProse(input), "## Plan\n\nFirst. Detail. Second.\n\nThen prose.");
});

test("fenced code is kept as it is", () => {
  const input = "- Item\n\n```\n- not a list [x]\n```";
  assert.equal(toProse(input), "Item.\n\n```\n- not a list [x]\n```");
});

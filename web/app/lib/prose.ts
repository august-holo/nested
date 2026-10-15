// Turns annotated markdown into flowing prose:
//
// - headings stay headings;
// - each list becomes one paragraph: every item, nested or not, becomes a
//   sentence, in the order written; a blank line ends the list;
// - anything in [square brackets] is a note, and is dropped, along with a
//   (link target) that follows it;
// - between [liststart] and [listend], a list is shown as a list, nesting and
//   all, with only the notes removed;
// - paragraphs and fenced code are kept as they are.

const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^\s*([-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const LIST_START = /^\s*\[liststart\]\s*$/i;
const LIST_END = /^\s*\[listend\]\s*$/i;
const ENDS_SENTENCE = /[.!?:;…"”’)]$/;

function stripNotes(text: string) {
  return text
    .replace(/\[[^\]]*\](\([^)]*\))?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A list item as a sentence: capitalised, and ending in a full stop unless it already ends. */
function sentence(text: string) {
  const clean = stripNotes(text);
  if (!clean) return "";
  const capitalised = clean[0].toLocaleUpperCase() + clean.slice(1);
  return ENDS_SENTENCE.test(capitalised) ? capitalised : capitalised + ".";
}

/**
 * A list kept as a list. Only the notes go, but the indentation is rewritten
 * so that any deeper indent nests, whatever its width: markdown itself wants
 * a nested item indented past the parent's text, which few people count.
 */
class KeptList {
  lines: string[] = [];
  /** Open items, outermost first: the indent they were written at, and the width of their marker. */
  private stack: { indent: number; marker: number }[] = [];

  add(line: string) {
    const text = stripNotes(line);
    if (!text || /^([-*+]|\d+[.)])$/.test(text)) return;
    const indent = /^\s*/.exec(line)![0].replace(/\t/g, "    ").length;
    const item = /^([-*+]|\d+[.)])\s+(.*)$/.exec(text);
    if (!item) {
      // Text under an item continues it.
      this.lines.push(" ".repeat(this.width(this.stack.length)) + text);
      return;
    }
    while (this.stack.length && indent <= this.stack[this.stack.length - 1].indent) {
      this.stack.pop();
    }
    const marker = item[1] + " ";
    this.lines.push(" ".repeat(this.width(this.stack.length)) + marker + item[2]);
    this.stack.push({ indent, marker: marker.length });
  }

  /** Columns to indent an item nested under the first `depth` open items. */
  private width(depth: number) {
    return this.stack.slice(0, depth).reduce((n, s) => n + s.marker, 0);
  }
}

/** Prose as markdown, one string. */
export function toProse(markdown: string): string {
  return toProseBlocks(markdown).join("\n\n");
}

/**
 * Prose as markdown blocks: a heading, a paragraph, a kept list or a code
 * block each. Rendered one by one, so two kept lists never merge into one.
 */
export function toProseBlocks(markdown: string): string[] {
  const out: string[] = [];
  let paragraph: string[] = [];
  let inList = false;
  let fence: string[] | null = null;
  let kept: KeptList | null = null;

  const flush = () => {
    if (paragraph.length) out.push(paragraph.join(" "));
    paragraph = [];
    inList = false;
  };

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");

    if (fence) {
      fence.push(raw);
      if (FENCE.test(line)) {
        out.push(fence.join("\n"));
        fence = null;
      }
      continue;
    }
    if (FENCE.test(line)) {
      flush();
      fence = [line];
      continue;
    }

    if (kept) {
      if (LIST_END.test(line)) {
        out.push(kept.lines.join("\n"));
        kept = null;
      } else kept.add(line);
      continue;
    }
    if (LIST_START.test(line)) {
      flush();
      kept = new KeptList();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const text = stripNotes(heading[2]);
      if (text) out.push(`${heading[1]} ${text}`);
      continue;
    }

    if (line.trim() === "") {
      flush();
      continue;
    }

    const item = ITEM.exec(line);
    if (item) {
      if (!inList) flush();
      inList = true;
      const s = sentence(item[2]);
      if (s) paragraph.push(s);
      continue;
    }

    if (inList && /^\s+\S/.test(line)) {
      // An indented line under an item continues that item's sentence.
      const last = paragraph.pop();
      const s = sentence(`${last ? last.replace(/\.$/, "") : ""} ${line}`);
      if (s) paragraph.push(s);
      continue;
    }

    if (inList) flush();
    const text = stripNotes(line);
    if (text) paragraph.push(text);
  }
  flush();
  if (fence) out.push(fence.join("\n"));
  if (kept) out.push(kept.lines.join("\n"));
  return out;
}

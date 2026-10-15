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

/** Prose as markdown: headings and paragraphs, nothing else. */
export function toProse(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let inList = false;
  let fence: string[] | null = null;
  let kept: string[] | null = null;

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
        out.push(kept.join("\n"));
        kept = null;
      } else {
        // Indentation and markers stay; only the notes go.
        const indent = /^\s*/.exec(raw)![0];
        const text = stripNotes(line);
        if (text) kept.push(indent + text);
      }
      continue;
    }
    if (LIST_START.test(line)) {
      flush();
      kept = [];
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
  if (kept) out.push(kept.join("\n"));
  return out.join("\n\n");
}

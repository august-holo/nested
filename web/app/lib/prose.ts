// Turns annotated markdown into flowing prose:
//
// - headings stay headings;
// - top-level list items become sentences, joined into one paragraph;
// - nested list items (and their continuation lines) are notes, and are dropped;
// - anything in [square brackets] is a note, and is dropped, along with a
//   (link target) that follows it;
// - paragraphs and fenced code are kept as they are.

const HEADING = /^(#{1,6})\s+(.*)$/;
const TOP_ITEM = /^([-*+]|\d+[.)])\s+(.*)$/;
const NESTED_ITEM = /^\s+([-*+]|\d+[.)])\s+/;
const FENCE = /^\s*(```|~~~)/;
const ENDS_SENTENCE = /[.!?:;…"”’)]$/;

function stripNotes(text: string) {
  return text
    .replace(/\[[^\]]*\](\([^)]*\))?/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentence(text: string) {
  const clean = stripNotes(text);
  if (!clean) return "";
  return ENDS_SENTENCE.test(clean) ? clean : clean + ".";
}

/** Prose as markdown: headings and paragraphs, nothing else. */
export function toProse(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let inList = false;
  let fence: string[] | null = null;

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

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const text = stripNotes(heading[2]);
      if (text) out.push(`${heading[1]} ${text}`);
      continue;
    }

    if (NESTED_ITEM.test(line) || (inList && /^\s+\S/.test(line))) continue;

    const item = TOP_ITEM.exec(line);
    if (item) {
      if (!inList) flush();
      inList = true;
      const s = sentence(item[2]);
      if (s) paragraph.push(s);
      continue;
    }

    if (line.trim() === "") {
      // A blank line inside a list does not end it; the next non-list line does.
      if (!inList) flush();
      continue;
    }

    if (inList) flush();
    const text = stripNotes(line);
    if (text) paragraph.push(text);
  }
  flush();
  if (fence) out.push(fence.join("\n"));
  return out.join("\n\n");
}

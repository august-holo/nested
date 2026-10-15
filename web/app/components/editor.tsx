"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  placeholder,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { useEffect, useRef } from "react";

interface Props {
  /** The document being edited; the editor is reset when this changes. */
  docId: string;
  initial: string;
  onChange(text: string): void;
}

// A [note] is blue unless it starts with a colour's first letter and a space:
// [o orange], [g green], [r red], [b blue]. The list markers are set apart.
const COLOURS: Record<string, string> = { o: "orange", g: "green", r: "red", b: "blue" };
const noteMatcher = new MatchDecorator({
  regexp: /\[(?:([ogrb]) )?[^\]\n]*\]/g,
  decoration: (m) => {
    const marker = /^\[list(start|end)\]$/i.test(m[0]);
    const colour = marker ? "marker" : (COLOURS[m[1]] ?? "blue");
    return Decoration.mark({ class: `note note-${colour}` });
  },
});
const notes = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = noteMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = noteMatcher.updateDeco(update, this.decorations);
    }
  },
  { decorations: (v) => v.decorations },
);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "15px" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.5", overflow: "auto" },
  ".cm-content": { padding: "16px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 16px" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    background: "var(--selection)",
  },
});

export function Editor({ docId, initial, onChange }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });

  useEffect(() => {
    const state = EditorState.create({
      doc: initial,
      extensions: [
        history(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
        markdown(),
        indentUnit.of("  "),
        new Compartment().of(EditorView.lineWrapping),
        placeholder("# A heading\n- A point [a note about it]\n  - a nested note"),
        theme,
        notes,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current! });
    view.focus();
    return () => view.destroy();
    // The editor holds its own text; only a different document replaces it. When
    // the effect does re-run (hot reload), `initial` is the draft, never older text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  return <div ref={host} className="editor-host" />;
}

"use client";

import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { indentUnit } from "@codemirror/language";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { useEffect, useRef } from "react";

interface Props {
  /** The document being edited; the editor is reset when this changes. */
  docId: string;
  initial: string;
  onChange(text: string): void;
}

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
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: host.current! });
    view.focus();
    return () => view.destroy();
    // The editor holds its own text; only a different document should replace it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  return <div ref={host} className="editor-host" />;
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { documentsApi, type Document, type Summary } from "../lib/api";
import { toProseBlocks } from "../lib/prose";
import { useSession } from "../lib/session";
import { Editor } from "./editor";
import styles from "./workspace.module.css";

const AUTOSAVE_MS = 1000;

type SaveState = "saved" | "unsaved" | "saving" | "failed";

export function Workspace() {
  const session = useSession();
  const api = useMemo(() => documentsApi(session.token), [session.token]);

  const [docs, setDocs] = useState<Summary[] | null>(null);
  const [current, setCurrent] = useState<Document | null>(null);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [problem, setProblem] = useState<string | null>(null);

  const show = useCallback((doc: Document) => {
    setCurrent(doc);
    setDraft({ title: doc.title, body: doc.body });
    setSaveState("saved");
  }, []);

  const open = useCallback(
    async (id: string) => {
      try {
        show(await api.read(id));
      } catch (e) {
        setProblem(`Could not open that document (${(e as Error).message}).`);
      }
    },
    [api, show],
  );

  // On arrival: the list, with the most recent document open.
  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const list = await api.list();
        if (stale) return;
        setDocs(list);
        if (list.length) {
          const doc = await api.read(list[0].id);
          if (!stale) show(doc);
        }
      } catch (e) {
        if (!stale) setProblem(`Could not load your documents (${(e as Error).message}).`);
      }
    })();
    return () => {
      stale = true;
    };
  }, [api, show]);

  const create = async () => {
    try {
      const doc = await api.create({ title: "Untitled", body: "" });
      setDocs((d) => [{ id: doc.id, title: doc.title, updated_at: doc.updated_at }, ...(d ?? [])]);
      show(doc);
    } catch (e) {
      setProblem(`Could not create a document (${(e as Error).message}).`);
    }
  };

  const remove = async () => {
    if (!current || !confirm(`Delete "${draft.title || "Untitled"}"? This cannot be undone.`))
      return;
    try {
      await api.remove(current.id);
      const rest = (docs ?? []).filter((s) => s.id !== current.id);
      setDocs(rest);
      setCurrent(null);
      if (rest.length) open(rest[0].id);
    } catch (e) {
      setProblem(`Could not delete it (${(e as Error).message}).`);
    }
  };

  // Autosave: a second after the last change, or at once when asked.
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(async () => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    if (!current) return;
    setSaveState("saving");
    try {
      const summary = await api.update(current.id, draft);
      setDocs((d) =>
        [summary, ...(d ?? []).filter((s) => s.id !== summary.id)].sort(
          (a, b) => b.updated_at - a.updated_at,
        ),
      );
      setSaveState("saved");
    } catch (e) {
      setSaveState("failed");
      setProblem(
        `Could not save (${(e as Error).message}). Your text is still here; it will retry.`,
      );
    }
  }, [api, current, draft]);

  const edit = (change: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...change }));
    setSaveState("unsaved");
    setProblem(null);
  };

  useEffect(() => {
    if (saveState !== "unsaved" && saveState !== "failed") return;
    pending.current = setTimeout(save, AUTOSAVE_MS);
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, [draft, saveState, save]);

  useEffect(() => {
    if (saveState === "saved") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

  const download = () => {
    const name = (draft.title.trim() || "untitled").replace(/[\\/:*?"<>|]+/g, "-");
    const blob = new Blob([draft.body], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.md` });
    a.click();
    URL.revokeObjectURL(url);
  };

  const prose = useMemo(() => toProseBlocks(draft.body), [draft.body]);

  return (
    <div className={styles.workspace}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <span className={styles.brand}>nested</span>
          <button onClick={create}>New</button>
        </div>
        <ul className={styles.list}>
          {docs?.map((d) => (
            <li key={d.id}>
              <button
                className={d.id === current?.id ? styles.selected : undefined}
                onClick={() => open(d.id)}
              >
                {d.id === current?.id ? draft.title || "Untitled" : d.title}
              </button>
            </li>
          ))}
          {docs?.length === 0 && <li className={styles.empty}>No documents yet.</li>}
        </ul>
        <div className={styles.sidebarFoot}>
          {session.email && <span title="Signed in as">{session.email}</span>}
          {session.token && <button onClick={session.signOut}>Sign out</button>}
        </div>
      </aside>

      {current ? (
        <>
          <section className={styles.pane}>
            <header className={styles.paneHead}>
              <input
                className={styles.title}
                value={draft.title}
                placeholder="Untitled"
                aria-label="Title"
                onChange={(e) => edit({ title: e.target.value })}
              />
              <span className={styles.saveState} aria-live="polite">
                {saveState === "saved" && "Saved"}
                {saveState === "unsaved" && "Unsaved"}
                {saveState === "saving" && "Saving…"}
                {saveState === "failed" && "Save failed"}
              </span>
              <button onClick={download} title="Download this document as a markdown file">
                Save .md
              </button>
              <button onClick={remove} className={styles.danger}>
                Delete
              </button>
            </header>
            <Editor docId={current.id} initial={draft.body} onChange={(body) => edit({ body })} />
          </section>
          <section className={`${styles.pane} ${styles.prose}`}>
            <header className={styles.paneHead}>
              <span className={styles.paneLabel}>Prose</span>
            </header>
            <div className={styles.proseBody}>
              {prose.map((block, i) => (
                <ReactMarkdown key={i}>{block}</ReactMarkdown>
              ))}
            </div>
          </section>
        </>
      ) : (
        <section className={styles.blank}>
          {docs === null ? "Loading…" : "Create a document to start writing."}
        </section>
      )}

      {problem && (
        <div className={styles.problem} role="alert">
          {problem}
          <button onClick={() => setProblem(null)} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}
    </div>
  );
}

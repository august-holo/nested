"use client";

import { Workspace } from "./components/workspace";
import { useSession } from "./lib/session";
import styles from "./page.module.css";

export default function Home() {
  const session = useSession();

  if (session.signedIn) return <Workspace />;

  return (
    <main className={styles.gate}>
      <h1>nested</h1>
      <p>Write with notes in the margins; read it back as prose.</p>
      {session.loading && <p>Loading…</p>}
      {session.error && <p className={styles.error}>Sign-in failed: {session.error}</p>}
      {!session.loading && <button onClick={session.signIn}>Sign in</button>}
    </main>
  );
}

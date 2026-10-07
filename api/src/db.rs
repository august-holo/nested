use std::{path::Path, sync::Mutex};

use rusqlite::Connection;

/// One SQLite file, one connection. Queries here take microseconds, so a mutex is
/// all the concurrency control this needs.
pub struct Db(Mutex<Connection>);

impl Db {
    pub fn open(dir: &Path) -> rusqlite::Result<Self> {
        std::fs::create_dir_all(dir).map_err(|e| {
            rusqlite::Error::SqliteFailure(
                rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
                Some(format!("{}: {e}", dir.display())),
            )
        })?;
        let conn = Connection::open(dir.join("nested.sqlite"))?;
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS documents (
                 id         TEXT PRIMARY KEY,
                 owner      TEXT NOT NULL,
                 title      TEXT NOT NULL,
                 body       TEXT NOT NULL,
                 created_at INTEGER NOT NULL,
                 updated_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS documents_owner ON documents (owner, updated_at DESC);",
        )?;
        Ok(Self(Mutex::new(conn)))
    }

    pub fn with<T>(
        &self,
        f: impl FnOnce(&Connection) -> rusqlite::Result<T>,
    ) -> rusqlite::Result<T> {
        let conn = self
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        f(&conn)
    }
}

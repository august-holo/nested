//! A signed-in user's markdown documents.

use std::{
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
};
use rusqlite::{OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::{AppState, auth::User, db::Db};

/// Enough for a long essay; larger bodies are refused rather than stored.
const MAX_BODY_BYTES: usize = 2 * 1024 * 1024;
const MAX_TITLE_CHARS: usize = 200;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/documents", get(list).post(create))
        .route("/documents/{id}", get(read).put(update).delete(delete))
}

#[derive(Serialize)]
struct Summary {
    id: String,
    title: String,
    updated_at: i64,
}

#[derive(Serialize)]
struct Document {
    id: String,
    title: String,
    body: String,
    created_at: i64,
    updated_at: i64,
}

#[derive(Deserialize)]
struct Draft {
    #[serde(default)]
    title: String,
    #[serde(default)]
    body: String,
}

impl Draft {
    fn check(mut self) -> Result<Self, StatusCode> {
        self.title = self.title.trim().to_string();
        if self.title.is_empty() {
            self.title = "Untitled".into();
        }
        if self.title.chars().count() > MAX_TITLE_CHARS || self.body.len() > MAX_BODY_BYTES {
            return Err(StatusCode::PAYLOAD_TOO_LARGE);
        }
        Ok(self)
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs() as i64)
}

fn failed(e: rusqlite::Error) -> StatusCode {
    tracing::error!("database: {e}");
    StatusCode::INTERNAL_SERVER_ERROR
}

async fn list(user: User, State(db): State<Arc<Db>>) -> Result<Json<Vec<Summary>>, StatusCode> {
    db.with(|c| {
        let mut q = c.prepare(
            "SELECT id, title, updated_at FROM documents WHERE owner = ?1 ORDER BY updated_at DESC",
        )?;
        q.query_map([&user.sub], |r| {
            Ok(Summary {
                id: r.get(0)?,
                title: r.get(1)?,
                updated_at: r.get(2)?,
            })
        })?
        .collect()
    })
    .map(Json)
    .map_err(failed)
}

async fn create(
    user: User,
    State(db): State<Arc<Db>>,
    Json(draft): Json<Draft>,
) -> Result<(StatusCode, Json<Document>), StatusCode> {
    let draft = draft.check()?;
    let doc = Document {
        id: uuid::Uuid::new_v4().to_string(),
        title: draft.title,
        body: draft.body,
        created_at: now(),
        updated_at: now(),
    };
    db.with(|c| {
        c.execute(
            "INSERT INTO documents (id, owner, title, body, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                doc.id,
                user.sub,
                doc.title,
                doc.body,
                doc.created_at,
                doc.updated_at
            ],
        )
    })
    .map_err(failed)?;
    Ok((StatusCode::CREATED, Json(doc)))
}

async fn read(
    user: User,
    State(db): State<Arc<Db>>,
    Path(id): Path<String>,
) -> Result<Json<Document>, StatusCode> {
    db.with(|c| {
        c.query_row(
            "SELECT id, title, body, created_at, updated_at FROM documents
             WHERE id = ?1 AND owner = ?2",
            [&id, &user.sub],
            |r| {
                Ok(Document {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    body: r.get(2)?,
                    created_at: r.get(3)?,
                    updated_at: r.get(4)?,
                })
            },
        )
        .optional()
    })
    .map_err(failed)?
    .map(Json)
    .ok_or(StatusCode::NOT_FOUND)
}

async fn update(
    user: User,
    State(db): State<Arc<Db>>,
    Path(id): Path<String>,
    Json(draft): Json<Draft>,
) -> Result<Json<Summary>, StatusCode> {
    let draft = draft.check()?;
    let updated_at = now();
    let changed = db
        .with(|c| {
            c.execute(
                "UPDATE documents SET title = ?1, body = ?2, updated_at = ?3
                 WHERE id = ?4 AND owner = ?5",
                params![draft.title, draft.body, updated_at, id, user.sub],
            )
        })
        .map_err(failed)?;
    if changed == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(Summary {
        id,
        title: draft.title,
        updated_at,
    }))
}

async fn delete(
    user: User,
    State(db): State<Arc<Db>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    let changed = db
        .with(|c| {
            c.execute(
                "DELETE FROM documents WHERE id = ?1 AND owner = ?2",
                [&id, &user.sub],
            )
        })
        .map_err(failed)?;
    if changed == 0 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(StatusCode::NO_CONTENT)
}

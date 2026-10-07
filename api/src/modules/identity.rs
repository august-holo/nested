use axum::{Json, Router, routing::get};
use serde::Serialize;

use crate::{AppState, auth::User};

pub fn router() -> Router<AppState> {
    Router::new().route("/me", get(me))
}

#[derive(Serialize)]
struct Me {
    sub: String,
    username: Option<String>,
}

async fn me(user: User) -> Json<Me> {
    Json(Me {
        sub: user.sub,
        username: user.username,
    })
}

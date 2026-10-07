mod auth;
mod db;
mod modules;

use std::{path::PathBuf, sync::Arc};

use axum::{Router, extract::FromRef};

#[derive(Clone, FromRef)]
pub struct AppState {
    verifier: Arc<auth::Verifier>,
    db: Arc<db::Db>,
}

/// The monolith: each module owns its routes and state and is mounted under /api.
/// Modules talk to each other only through their public functions, never their internals.
fn app(state: AppState) -> Router {
    Router::new()
        .nest(
            "/api",
            Router::new()
                .merge(modules::health::router())
                .merge(modules::identity::router())
                .merge(modules::documents::router()),
        )
        .with_state(state)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt().with_ansi(false).init();
    rustls::crypto::ring::default_provider()
        .install_default()
        .expect("no other TLS provider is installed");

    let data_dir = PathBuf::from(std::env::var("DATA_DIR").unwrap_or_else(|_| "data".into()));
    let state = AppState {
        verifier: Arc::new(auth::Verifier::from_env()?),
        db: Arc::new(db::Db::open(&data_dir)?),
    };

    let addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "127.0.0.1:8080".into());
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("listening on http://{addr}");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

/// systemd stops the service with SIGTERM; finish in-flight requests first.
async fn shutdown_signal() {
    use tokio::signal::unix::{SignalKind, signal};
    let mut term = signal(SignalKind::terminate()).expect("install SIGTERM handler");
    tokio::select! {
        _ = term.recv() => {}
        _ = tokio::signal::ctrl_c() => {}
    }
}

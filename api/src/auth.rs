use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    extract::{FromRef, FromRequestParts},
    http::{StatusCode, header::AUTHORIZATION, request::Parts},
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header, jwk::JwkSet};
use serde::Deserialize;
use tokio::sync::RwLock;

/// Minimum time between JWKS fetches, so unknown key ids can't be used to hammer Cognito.
const JWKS_REFRESH_INTERVAL: Duration = Duration::from_secs(60);

/// The signed-in user, taken from a verified Cognito access token.
pub struct User {
    pub sub: String,
    pub username: Option<String>,
}

#[derive(Deserialize)]
struct AccessTokenClaims {
    sub: String,
    client_id: String,
    token_use: String,
    username: Option<String>,
}

pub enum Verifier {
    Cognito(CognitoVerifier),
    /// Local development only: every request is treated as this user.
    DevUser(String),
}

pub struct CognitoVerifier {
    issuer: String,
    client_id: String,
    http: reqwest::Client,
    keys: RwLock<Keys>,
}

#[derive(Default)]
struct Keys {
    by_kid: HashMap<String, DecodingKey>,
    fetched_at: Option<Instant>,
}

impl Verifier {
    /// COGNITO_ISSUER and COGNITO_CLIENT_ID select real verification.
    /// Without them, DEV_USER_SUB must be set explicitly to run unauthenticated.
    pub fn from_env() -> Result<Self, String> {
        match (
            std::env::var("COGNITO_ISSUER"),
            std::env::var("COGNITO_CLIENT_ID"),
        ) {
            (Ok(issuer), Ok(client_id)) => Ok(Self::Cognito(CognitoVerifier {
                issuer,
                client_id,
                http: reqwest::Client::builder()
                    .timeout(Duration::from_secs(5))
                    .build()
                    .map_err(|e| e.to_string())?,
                keys: RwLock::default(),
            })),
            _ => std::env::var("DEV_USER_SUB").map(Self::DevUser).map_err(|_| {
                "set COGNITO_ISSUER and COGNITO_CLIENT_ID, or DEV_USER_SUB for local development"
                    .to_string()
            }),
        }
    }

    async fn verify(&self, parts: &Parts) -> Result<User, StatusCode> {
        match self {
            Self::DevUser(sub) => Ok(User {
                sub: sub.clone(),
                username: Some("dev".into()),
            }),
            Self::Cognito(cognito) => {
                let token = parts
                    .headers
                    .get(AUTHORIZATION)
                    .and_then(|v| v.to_str().ok())
                    .and_then(|v| v.strip_prefix("Bearer "))
                    .ok_or(StatusCode::UNAUTHORIZED)?;
                cognito.verify(token).await
            }
        }
    }
}

impl CognitoVerifier {
    async fn verify(&self, token: &str) -> Result<User, StatusCode> {
        let kid = decode_header(token)
            .ok()
            .and_then(|h| h.kid)
            .ok_or(StatusCode::UNAUTHORIZED)?;
        let key = self.key(&kid).await?;

        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[&self.issuer]);
        // Cognito access tokens carry client_id instead of aud; checked below.
        validation.validate_aud = false;

        let claims = decode::<AccessTokenClaims>(token, &key, &validation)
            .map_err(|_| StatusCode::UNAUTHORIZED)?
            .claims;
        if claims.token_use != "access" || claims.client_id != self.client_id {
            return Err(StatusCode::UNAUTHORIZED);
        }
        Ok(User {
            sub: claims.sub,
            username: claims.username,
        })
    }

    async fn key(&self, kid: &str) -> Result<DecodingKey, StatusCode> {
        if let Some(key) = self.keys.read().await.by_kid.get(kid) {
            return Ok(key.clone());
        }

        let mut keys = self.keys.write().await;
        let recently_fetched = keys
            .fetched_at
            .is_some_and(|t| t.elapsed() < JWKS_REFRESH_INTERVAL);
        if !recently_fetched {
            match self.fetch_keys().await {
                Ok(by_kid) => keys.by_kid = by_kid,
                Err(e) => {
                    tracing::error!("fetching JWKS failed: {e}");
                    if keys.by_kid.is_empty() {
                        return Err(StatusCode::SERVICE_UNAVAILABLE);
                    }
                }
            }
            keys.fetched_at = Some(Instant::now());
        }
        keys.by_kid
            .get(kid)
            .cloned()
            .ok_or(StatusCode::UNAUTHORIZED)
    }

    async fn fetch_keys(&self) -> Result<HashMap<String, DecodingKey>, reqwest::Error> {
        let url = format!("{}/.well-known/jwks.json", self.issuer);
        let jwks: JwkSet = self
            .http
            .get(url)
            .send()
            .await?
            .error_for_status()?
            .json()
            .await?;
        Ok(jwks
            .keys
            .iter()
            .filter_map(|jwk| {
                let kid = jwk.common.key_id.clone()?;
                Some((kid, DecodingKey::from_jwk(jwk).ok()?))
            })
            .collect())
    }
}

impl<S> FromRequestParts<S> for User
where
    S: Send + Sync,
    Arc<Verifier>: FromRef<S>,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        Arc::<Verifier>::from_ref(state).verify(parts).await
    }
}

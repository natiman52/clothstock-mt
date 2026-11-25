//! One-time first-launch onboarding.
//!
//! The password is never stored in plaintext. An Argon2id hash is kept in the
//! local SQLite `settings` table together with an `initialized=1` flag.
//! After this succeeds, later launches skip this flow entirely (no login screen).

use crate::db::{get_setting, log_action, set_setting};
use crate::error::{PosError, PosResult};
use crate::models::TerminalSettings;
use crate::sync;
use argon2::password_hash::{rand_core::OsRng, PasswordHasher, SaltString};
use argon2::Argon2;
use rusqlite::Connection;
use serde_json::json;

pub const MIN_PASSWORD_LEN: usize = 8;

pub fn hash_password(password: &str) -> PosResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| PosError::msg(format!("Could not hash password: {e}")))
}

pub fn validate(
    store_code: &str,
    username: &str,
    password: &str,
    password_confirm: &str,
) -> PosResult<()> {
    if store_code.trim().is_empty() {
        return Err(PosError::msg("Store code is required."));
    }
    if username.trim().is_empty() {
        return Err(PosError::msg("Username is required."));
    }
    if password.len() < MIN_PASSWORD_LEN {
        return Err(PosError::msg(format!(
            "Password must be at least {MIN_PASSWORD_LEN} characters."
        )));
    }
    if password != password_confirm {
        return Err(PosError::msg("Password confirmation does not match."));
    }
    Ok(())
}

/// Authenticate against ClothStock, bind this terminal to a store, import catalog,
/// then persist the initialized flag. This is the only interactive network call.
pub fn complete_onboarding(
    conn: &mut Connection,
    store_code: &str,
    username: &str,
    password: &str,
    password_confirm: &str,
) -> PosResult<TerminalSettings> {
    if get_setting(conn, "initialized")? == "1" {
        return Err(PosError::msg("This terminal is already initialized."));
    }

    validate(store_code, username, password, password_confirm)?;
    let password_hash = hash_password(password)?;
    let api_url = get_setting(conn, "api_url")?;
    if api_url.trim().is_empty() {
        return Err(PosError::msg("API URL is not configured."));
    }

    let token = sync::login(&api_url, username.trim(), password)?;
    let store = sync::resolve_store_by_code(&api_url, &token, store_code.trim())?;
    let imported = sync::import_catalog(conn, &api_url, &token, &store.id)?;

    set_setting(conn, "auth_token", &token)?;
    set_setting(conn, "username", username.trim())?;
    set_setting(conn, "cashier_name", username.trim())?;
    set_setting(conn, "store_name", &store.name)?;
    set_setting(conn, "store_id", &store.id)?;
    set_setting(conn, "store_code", &store.code)?;
    set_setting(conn, "password_hash", &password_hash)?;
    set_setting(conn, "initialized", "1")?;

    log_action(
        conn,
        "ONBOARDING_COMPLETE",
        &json!({
            "store_name": store.name,
            "store_id": store.id,
            "store_code": store.code,
            "username": username.trim(),
            "catalog_imported": imported,
        }),
    )?;

    let mut settings = crate::db::load_settings(conn)?;
    settings.auth_token.clear();
    Ok(settings)
}

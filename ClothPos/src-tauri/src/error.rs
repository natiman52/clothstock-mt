use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum PosError {
    #[error("{0}")]
    Message(String),
    #[error("Database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("Network error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

impl PosError {
    pub fn msg(text: impl Into<String>) -> Self {
        Self::Message(text.into())
    }
}

impl Serialize for PosError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type PosResult<T> = Result<T, PosError>;

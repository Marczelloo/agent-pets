use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Endpoint {
    pub port: u16,
    pub token: String,
}

impl Endpoint {
    pub fn default_path() -> PathBuf {
        dirs::config_dir().unwrap_or_else(std::env::temp_dir).join("agent-pets").join("endpoint.json")
    }

    pub fn new_token() -> String {
        use rand::RngCore;
        let mut b = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut b);
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    /// Zapis atomowy: plik tymczasowy obok, potem rename. %APPDATA% ma domyślnie uprawnienia tylko dla użytkownika.
    pub fn write(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() { std::fs::create_dir_all(dir)?; }
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec(self)?)?;
        std::fs::rename(&tmp, path)
    }

    pub fn read(path: &Path) -> std::io::Result<Endpoint> {
        let data = std::fs::read(path)?;
        serde_json::from_slice(&data).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_and_token_shape() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("sub").join("endpoint.json");
        let e = Endpoint { port: 4242, token: Endpoint::new_token() };
        assert_eq!(e.token.len(), 64);
        assert!(e.token.chars().all(|c| c.is_ascii_hexdigit()));
        e.write(&p).unwrap();
        assert_eq!(Endpoint::read(&p).unwrap(), e);
    }
}

//! Jedna wersja w trzech miejscach: Cargo (workspace), `tauri.conf.json` (instalator, updater) i `package.json`.
#[cfg(test)]
mod tests {
    fn version_of(json: &str) -> String {
        serde_json::from_str::<serde_json::Value>(json).unwrap()["version"].as_str().unwrap().to_string()
    }

    #[test]
    fn cargo_tauri_and_package_versions_match() {
        let cargo = env!("CARGO_PKG_VERSION");
        assert_eq!(version_of(include_str!("../tauri.conf.json")), cargo, "tauri.conf.json");
        assert_eq!(version_of(include_str!("../../package.json")), cargo, "app/package.json");
    }
}

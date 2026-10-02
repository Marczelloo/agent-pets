//! The Start Menu shortcut that carries the toast AUMID. Windows draws a toast's header icon and name from the
//! shortcut registered under the AUMID: the registry key alone gets toasts delivered, but this Windows shows no
//! header icon for it. The installer already makes the shortcut; this stamps the AUMID on it (or makes one).
use std::path::{Path, PathBuf};
use windows::core::{Interface, BSTR, HSTRING};
use windows::Win32::Storage::EnhancedStorage::PKEY_AppUserModel_ID;
use windows::Win32::System::Com::StructuredStorage::PROPVARIANT;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READWRITE};
use windows::Win32::UI::Shell::PropertiesSystem::IPropertyStore;
use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

/// Shortcut path in the current user's Start Menu.
pub fn start_menu_link() -> Option<PathBuf> {
    let appdata = std::env::var_os("APPDATA")?;
    Some(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs\Agent Pets.lnk"))
}

/// Make sure the shortcut at `lnk` exists and has `aumid`. An existing shortcut keeps its target and everything
/// else; it is only rewritten when the AUMID differs.
pub fn ensure_at(lnk: &Path, exe: &Path, aumid: &str) -> windows::core::Result<()> {
    unsafe {
        // already initialised on this thread is fine (S_FALSE / RPC_E_CHANGED_MODE are not errors for us)
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;
        let file: IPersistFile = link.cast()?;
        let path = HSTRING::from(lnk.as_os_str());
        if lnk.is_file() {
            file.Load(&path, STGM_READWRITE)?;
        } else {
            let exe_s = HSTRING::from(exe.as_os_str());
            link.SetPath(&exe_s)?;
            link.SetIconLocation(&exe_s, 0)?;
            if let Some(dir) = exe.parent() { link.SetWorkingDirectory(&HSTRING::from(dir.as_os_str()))?; }
        }
        let store: IPropertyStore = link.cast()?;
        let current = store.GetValue(&PKEY_AppUserModel_ID)
            .ok()
            .and_then(|v| BSTR::try_from(&v).ok())
            .map(|b| b.to_string());
        if current.as_deref() == Some(aumid) { return Ok(()); }
        store.SetValue(&PKEY_AppUserModel_ID, &PROPVARIANT::from(aumid))?;
        store.Commit()?;
        file.Save(&path, true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(lnk: &Path) -> Option<String> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).ok()?;
            let file: IPersistFile = link.cast().ok()?;
            file.Load(&HSTRING::from(lnk.as_os_str()), STGM_READWRITE).ok()?;
            let store: IPropertyStore = link.cast().ok()?;
            let v = store.GetValue(&PKEY_AppUserModel_ID).ok()?;
            BSTR::try_from(&v).ok().map(|b| b.to_string())
        }
    }

    #[test]
    fn creates_a_shortcut_with_the_aumid_and_restamps_a_foreign_one() {
        let dir = tempfile::tempdir().unwrap();
        let (lnk, exe) = (dir.path().join("Agent Pets.lnk"), std::env::current_exe().unwrap());
        ensure_at(&lnk, &exe, "dev.agentpets.one").unwrap();
        assert_eq!(read(&lnk).as_deref(), Some("dev.agentpets.one"));
        ensure_at(&lnk, &exe, "dev.agentpets.one").unwrap();
        ensure_at(&lnk, &exe, "dev.agentpets.two").unwrap();
        assert_eq!(read(&lnk).as_deref(), Some("dev.agentpets.two"));
    }
}

#[cfg(windows)]
pub fn is_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ACCESS_DENIED, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            // chroniony proces istnieje, ale nie wolno go otworzyć
            return GetLastError() == ERROR_ACCESS_DENIED;
        }
        let mut code = 0u32;
        let ok = GetExitCodeProcess(h, &mut code);
        CloseHandle(h);
        ok != 0 && code == STILL_ACTIVE as u32
    }
}

#[cfg(windows)]
pub fn process_entry(pid: u32) -> Option<(u32, String)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE { return None; }
        let mut e: PROCESSENTRY32W = std::mem::zeroed();
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut e);
        let mut out = None;
        while ok != 0 {
            if e.th32ProcessID == pid {
                let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
                out = Some((e.th32ParentProcessID, String::from_utf16_lossy(&e.szExeFile[..len])));
                break;
            }
            ok = Process32NextW(snap, &mut e);
        }
        CloseHandle(snap);
        out
    }
}

const SHELLS: [&str; 6] = ["cmd.exe", "bash.exe", "sh.exe", "pwsh.exe", "powershell.exe", "conhost.exe"];

/// PID agenta: pierwszy przodek bieżącego procesu, który nie jest powłoką.
#[cfg(windows)]
pub fn agent_pid() -> Option<u32> {
    let (mut pid, _) = process_entry(std::process::id())?;
    for _ in 0..4 {
        let (parent, name) = process_entry(pid)?;
        if SHELLS.contains(&name.to_lowercase().as_str()) { pid = parent; } else { return Some(pid); }
    }
    Some(pid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn own_process_is_alive_and_has_entry() {
        assert!(is_alive(std::process::id()));
        let (_, name) = process_entry(std::process::id()).unwrap();
        assert!(name.to_lowercase().ends_with(".exe"));
    }

    #[test]
    fn exited_child_is_dead() {
        let mut c = std::process::Command::new("cmd").args(["/c", "exit", "0"]).spawn().unwrap();
        let id = c.id();
        c.wait().unwrap();
        assert!(!is_alive(id));
    }
}

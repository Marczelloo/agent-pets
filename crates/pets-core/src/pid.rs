#[cfg(windows)]
pub fn is_alive(pid: u32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ACCESS_DENIED, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            // the protected process exists but cannot be opened
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

/// All processes from one snapshot: `(pid, parent, file name)`.
#[cfg(windows)]
pub fn process_list() -> Vec<(u32, u32, String)> {
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::*;
    let mut out = Vec::new();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap == INVALID_HANDLE_VALUE { return out; }
        let mut e: PROCESSENTRY32W = std::mem::zeroed();
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = Process32FirstW(snap, &mut e);
        while ok != 0 {
            let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
            out.push((e.th32ProcessID, e.th32ParentProcessID, String::from_utf16_lossy(&e.szExeFile[..len])));
            ok = Process32NextW(snap, &mut e);
        }
        CloseHandle(snap);
    }
    out
}

/// Process creation time (FILETIME, 100 ns since 1601); `None` if inaccessible or exited.
#[cfg(windows)]
pub fn process_created(pid: u32) -> Option<u64> {
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME};
    use windows_sys::Win32::System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() { return None; }
        let z = || FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
        let (mut c, mut x, mut k, mut u) = (z(), z(), z(), z());
        let ok = GetProcessTimes(h, &mut c, &mut x, &mut k, &mut u);
        CloseHandle(h);
        (ok != 0).then_some(((c.dwHighDateTime as u64) << 32) | c.dwLowDateTime as u64)
    }
}

/// Command line of a process owned by the same user; `None` if inaccessible or exited.
#[cfg(windows)]
pub fn command_line(pid: u32) -> Option<String> {
    use windows_sys::Wdk::System::Threading::{NtQueryInformationProcess, ProcessCommandLineInformation};
    use windows_sys::Win32::Foundation::{CloseHandle, UNICODE_STRING};
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION};
    unsafe {
        let h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() { return None; }
        // response: UNICODE_STRING followed by its text; u64 buffer for pointer alignment
        let mut buf = vec![0u64; 8 * 1024];
        let mut len = 0u32;
        let st = NtQueryInformationProcess(h, ProcessCommandLineInformation, buf.as_mut_ptr().cast(), (buf.len() * 8) as u32, &mut len);
        CloseHandle(h);
        if st < 0 { return None; }
        let us = &*(buf.as_ptr() as *const UNICODE_STRING);
        if us.Buffer.is_null() { return None; }
        // text must fit entirely in our buffer and in what the system actually wrote
        let (start, end) = (buf.as_ptr() as usize, buf.as_ptr() as usize + buf.len() * 8);
        let (text, bytes) = (us.Buffer as usize, us.Length as usize);
        if text < start || text + bytes > end || text + bytes > start + len as usize { return None; }
        Some(String::from_utf16_lossy(std::slice::from_raw_parts(us.Buffer, bytes / 2)))
    }
}

/// TCP (IPv4) ports on which the process listens.
#[cfg(windows)]
pub fn listening_ports(pid: u32) -> Vec<u16> {
    use windows_sys::Win32::NetworkManagement::IpHelper::{GetExtendedTcpTable, MIB_TCPROW_OWNER_PID, TCP_TABLE_OWNER_PID_LISTENER};
    const AF_INET: u32 = 2;
    let mut size = 0u32;
    unsafe {
        GetExtendedTcpTable(std::ptr::null_mut(), &mut size, 0, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0);
        // allow for the table growing between queries
        let mut buf = vec![0u32; size as usize / 4 + 64];
        size = (buf.len() * 4) as u32;
        if GetExtendedTcpTable(buf.as_mut_ptr().cast(), &mut size, 0, AF_INET, TCP_TABLE_OWNER_PID_LISTENER, 0) != 0 { return Vec::new(); }
        // row count from the table, capped by buffer capacity (each row is 6 × u32)
        let n = (buf[0] as usize).min((buf.len() - 1) / 6);
        let rows = std::slice::from_raw_parts(buf.as_ptr().add(1) as *const MIB_TCPROW_OWNER_PID, n);
        let mut out: Vec<u16> = rows.iter().filter(|r| r.dwOwningPid == pid).map(|r| u16::from_be(r.dwLocalPort as u16)).collect();
        out.sort_unstable();
        out.dedup();
        out
    }
}

const SHELLS: [&str; 6] = ["cmd.exe", "bash.exe", "sh.exe", "pwsh.exe", "powershell.exe", "conhost.exe"];

/// Agent PID: first ancestor of the current process that is not a shell.
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
    fn own_command_line_and_listening_port() {
        assert!(command_line(std::process::id()).unwrap().to_lowercase().contains(".exe"));
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        assert!(listening_ports(std::process::id()).contains(&l.local_addr().unwrap().port()));
    }

    #[test]
    fn exited_child_is_dead() {
        let mut c = std::process::Command::new("cmd").args(["/c", "exit", "0"]).spawn().unwrap();
        let id = c.id();
        c.wait().unwrap();
        assert!(!is_alive(id));
    }
}

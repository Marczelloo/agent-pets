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

/// Shell processes whose windows are never session windows (Windows names).
#[cfg(windows)]
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

#[cfg(not(windows))]
pub fn is_alive(pid: u32) -> bool { std::path::Path::new(&format!("/proc/{pid}")).exists() }

#[cfg(not(windows))]
pub fn process_entry(pid: u32) -> Option<(u32, String)> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    // "pid (comm) state pppid ..."; comm may contain spaces and parens, so cut after the last ')'
    let after = stat.rsplit(')').next()?;
    let ppid = after.split_whitespace().nth(1)?.parse().ok()?;
    Some((ppid, proc_name(pid)))
}

/// Process name: full executable name from `/proc/<pid>/exe` (readlink), or the kernel `comm` fallback
/// (truncated to 15 characters, without the executable path).
#[cfg(not(windows))]
fn proc_name(pid: u32) -> String {
    if let Ok(exe) = std::fs::read_link(format!("/proc/{pid}/exe")) {
        if let Some(name) = exe.file_name().and_then(|n| n.to_str()) { return name.to_string(); }
    }
    std::fs::read_to_string(format!("/proc/{pid}/comm")).unwrap_or_default().trim().to_string()
}

/// All processes from one snapshot: `(pid, parent, file name)`.
#[cfg(not(windows))]
pub fn process_list() -> Vec<(u32, u32, String)> {
    let mut out = Vec::new();
    if let Ok(dir) = std::fs::read_dir("/proc") {
        for e in dir.flatten() {
            let Some(pid) = e.file_name().to_str().and_then(|n| n.parse::<u32>().ok()) else { continue };
            if let Some((ppid, name)) = process_entry(pid) { out.push((pid, ppid, name)); }
        }
    }
    out
}

/// Process creation time (clock ticks since boot, comparable within one run); `None` if inaccessible or exited.
#[cfg(not(windows))]
pub fn process_created(pid: u32) -> Option<u64> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let after = stat.rsplit(')').next()?;
    // starttime is field 22, so field 5 of the part after "(comm) state"
    after.split_whitespace().nth(19)?.parse().ok()
}

/// Command line of a process owned by the same user; `None` if inaccessible or exited.
#[cfg(not(windows))]
pub fn command_line(pid: u32) -> Option<String> {
    let raw = std::fs::read(format!("/proc/{pid}/cmdline")).ok()?;
    if raw.is_empty() { return None; }
    Some(raw.split(|&b| b == 0).map(|a| String::from_utf8_lossy(a).into_owned())
        .collect::<Vec<_>>().join(" "))
}

/// TCP (IPv4) ports on which the process listens.
#[cfg(not(windows))]
pub fn listening_ports(pid: u32) -> Vec<u16> {
    // socket inodes open by this process
    let mut inodes = std::collections::HashSet::new();
    let fd_dir = format!("/proc/{pid}/fd");
    if let Ok(dir) = std::fs::read_dir(&fd_dir) {
        for e in dir.flatten() {
            if let Ok(link) = std::fs::read_link(e.path()) {
                let name = link.to_string_lossy();
                if let Some(ino) = name.strip_prefix("socket:").map(|r| r.trim_start_matches('[').trim_end_matches(']')) {
                    inodes.insert(ino.to_string());
                }
            }
        }
    }
    // LISTEN rows (state 0A) of the network namespace's IPv4 table: inode -> port
    let mut out = Vec::new();
    if let Ok(text) = std::fs::read_to_string(format!("/proc/{pid}/net/tcp")) {
        for line in text.lines().skip(1) {
            let f: Vec<&str> = line.split_whitespace().collect();
            if f.len() < 10 || f[3] != "0A" { continue; }
            if !inodes.contains(f[9]) { continue; }
            if let Some(port) = f[1].split(':').nth(1).and_then(|p| u16::from_str_radix(p, 16).ok()) { out.push(port); }
        }
    }
    out.sort_unstable();
    out.dedup();
    out
}

/// Shell processes whose windows are never session windows (Linux names, `sh -c` runs the hooks).
#[cfg(not(windows))]
const SHELLS: [&str; 8] = ["sh", "bash", "dash", "zsh", "fish", "ksh", "pwsh", "node"];

/// Agent PID: first ancestor of the current process that is not a shell.
#[cfg(not(windows))]
pub fn agent_pid() -> Option<u32> {
    let (mut pid, _) = process_entry(std::process::id())?;
    for _ in 0..4 {
        let (parent, name) = process_entry(pid)?;
        if SHELLS.contains(&name.as_str()) { pid = parent; } else { return Some(pid); }
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
        assert!(!name.is_empty());
    }

    #[test]
    fn own_command_line_and_listening_port() {
        let cmd = command_line(std::process::id()).unwrap();
        assert!(!cmd.is_empty(), "{cmd:?}");
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        assert!(listening_ports(std::process::id()).contains(&l.local_addr().unwrap().port()));
    }

    #[cfg(windows)]
    #[test]
    fn own_process_name_has_the_windows_suffix() {
        let (_, name) = process_entry(std::process::id()).unwrap();
        assert!(name.to_lowercase().ends_with(".exe"));
    }

    #[cfg(not(windows))]
    #[test]
    fn own_command_line_names_this_test_binary() {
        let cmd = command_line(std::process::id()).unwrap().to_lowercase();
        assert!(cmd.contains("pets"), "{cmd}");
    }

    #[test]
    fn exited_child_is_dead() {
        let mut c = if cfg!(windows) {
            std::process::Command::new("cmd").args(["/c", "exit", "0"]).spawn().unwrap()
        } else {
            std::process::Command::new("sh").args(["-c", "exit 0"]).spawn().unwrap()
        };
        let id = c.id();
        c.wait().unwrap();
        assert!(!is_alive(id));
    }

    #[cfg(not(windows))]
    #[test]
    fn agent_pid_skips_the_test_shell_runner() {
        // the test binary runs under a shell or cargo: some non-shell ancestor must exist
        assert!(agent_pid().is_some());
    }
}

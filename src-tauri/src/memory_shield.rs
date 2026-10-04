use serde::{Deserialize, Serialize};
use windows::core::PWSTR;
use windows::Win32::Foundation::{CloseHandle, HANDLE};
use windows::Win32::System::ProcessStatus::{
    K32EmptyWorkingSet, K32EnumProcesses, K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS,
};
use windows::Win32::System::Threading::{
    OpenProcess, PROCESS_NAME_FORMAT, PROCESS_QUERY_INFORMATION, PROCESS_SET_QUOTA,
    PROCESS_VM_READ, QueryFullProcessImageNameW,
};
use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessTrimDetail {
    pub pid: u32,
    pub process_name: String,
    pub ws_before_bytes: u64,
    pub ws_after_bytes: u64,
    pub reclaimed_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrimReport {
    pub total_bytes_reclaimed: u64,
    pub total_mb_reclaimed: f64,
    pub processes_scanned: usize,
    pub processes_trimmed: usize,
    pub foreground_pid_protected: u32,
    pub details: Vec<ProcessTrimDetail>,
}

pub fn get_active_foreground_pid() -> u32 {
    unsafe {
        let fg_hwnd = GetForegroundWindow();
        if fg_hwnd.0 == 0 as _ {
            return 0;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(fg_hwnd, Some(&mut pid));
        pid
    }
}

pub fn get_process_name(handle: HANDLE) -> String {
    let mut buf = [0u16; 1024];
    let mut size = buf.len() as u32;
    unsafe {
        if QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), PWSTR(buf.as_mut_ptr()), &mut size).is_ok() {
            let path = String::from_utf16_lossy(&buf[..size as usize]);
            if let Some(name) = path.rsplit('\\').next() {
                return name.to_string();
            }
            return path;
        }
    }
    "unknown".to_string()
}

pub const PROTECTED_PROCESS_NAMES: &[&str] = &[
    "system", "registry", "smss.exe", "csrss.exe", "wininit.exe", "services.exe",
    "lsass.exe", "svchost.exe", "fontdrvhost.exe", "winlogon.exe", "dwm.exe",
    "sihost.exe", "taskhostw.exe", "explorer.exe", "shellexperiencehost.exe",
    "startmenuexperiencehost.exe", "searchhost.exe", "searchindexer.exe",
    "ctfmon.exe", "textinputhost.exe", "systemsettings.exe", "runtimebroker.exe",
    "applicationframehost.exe",
    "audiodg.exe", "rtkaudioservice64.exe", "nvxdsync.exe", "nvcontainer.exe",
    "nvdisplay.container.exe", "radeonssoftware.exe", "amdfendrsr.exe",
    "igfxem.exe", "intelcphdcp.exe", "intelcphdcsvc.exe",
    "onedrive.exe", "dropbox.exe", "googledrivefs.exe", "powertoys.exe",
    "powertoys.runner.exe", "autohotkey.exe", "everything.exe", "sharex.exe",
    "ditto.exe", "flux.exe", "securityhealthservice.exe", "securityhealthsystray.exe",
    "msmpeng.exe",
    "slack.exe", "discord.exe", "telegram.exe", "whatsapp.exe", "zoom.exe", "teams.exe",
    "powershell.exe", "cmd.exe", "wt.exe", "bash.exe", "wsl.exe", "conhost.exe",
    "potatoclaw.exe", "potatoclaw_lib.exe",
    "msedgewebview2.exe", "webview2.exe", "webviewhost.exe"
];

pub fn is_protected_process(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.contains("potatoclaw")
        || lower.contains("msedgewebview2")
        || lower.contains("webview2")
    {
        return true;
    }
    PROTECTED_PROCESS_NAMES.iter().any(|&p| p == lower)
}

pub fn trim_idle_background_processes(min_bytes_threshold: usize) -> TrimReport {
    let foreground_pid = get_active_foreground_pid();
    let current_pid = std::process::id();

    let mut pids = [0u32; 2048];
    let mut cb_needed = 0u32;

    let mut details = Vec::new();
    let mut total_reclaimed: u64 = 0;
    let mut scanned_count = 0;

    unsafe {
        let ok = K32EnumProcesses(
            pids.as_mut_ptr(),
            (pids.len() * std::mem::size_of::<u32>()) as u32,
            &mut cb_needed,
        );

        if ok.as_bool() {
            let count = (cb_needed as usize) / std::mem::size_of::<u32>();
            scanned_count = count;

            for &pid in &pids[..count] {
                // Rule: Skip system idle process (0), system process (4), current app process,
                // and strictly protect active foreground editor/browser process.
                if pid == 0 || pid == 4 || pid == current_pid || (foreground_pid != 0 && pid == foreground_pid) {
                    continue;
                }

                let handle = match OpenProcess(
                    PROCESS_QUERY_INFORMATION | PROCESS_VM_READ | PROCESS_SET_QUOTA,
                    false,
                    pid,
                ) {
                    Ok(h) => h,
                    Err(_) => continue,
                };

                let name = get_process_name(handle);
                if is_protected_process(&name) {
                    let _ = CloseHandle(handle);
                    continue;
                }

                let mut pmc_before = PROCESS_MEMORY_COUNTERS::default();
                pmc_before.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;

                if K32GetProcessMemoryInfo(handle, &mut pmc_before, pmc_before.cb).as_bool() {
                    let ws_before = pmc_before.WorkingSetSize as u64;

                    if ws_before >= min_bytes_threshold as u64 {
                        let trim_ok = K32EmptyWorkingSet(handle);

                        if trim_ok.as_bool() {
                            let mut pmc_after = PROCESS_MEMORY_COUNTERS::default();
                            pmc_after.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;

                            if K32GetProcessMemoryInfo(handle, &mut pmc_after, pmc_after.cb).as_bool() {
                                let ws_after = pmc_after.WorkingSetSize as u64;
                                let reclaimed = ws_before.saturating_sub(ws_after);

                                details.push(ProcessTrimDetail {
                                    pid,
                                    process_name: name,
                                    ws_before_bytes: ws_before,
                                    ws_after_bytes: ws_after,
                                    reclaimed_bytes: reclaimed,
                                });

                                total_reclaimed += reclaimed;
                            }
                        }
                    }
                }

                let _ = CloseHandle(handle);
            }
        }
    }

    TrimReport {
        total_bytes_reclaimed: total_reclaimed,
        total_mb_reclaimed: (total_reclaimed as f64) / (1024.0 * 1024.0),
        processes_scanned: scanned_count,
        processes_trimmed: details.len(),
        foreground_pid_protected: foreground_pid,
        details,
    }
}

pub fn trim_current_process() {
    // Intentionally no-op to prevent paging out PotatoClaw and its WebView2 rendering pipeline
}


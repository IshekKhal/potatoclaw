use potatoclaw_lib::memory_shield::{get_active_foreground_pid, trim_idle_background_processes};

#[test]
fn test_foreground_pid_protected() {
    let fg_pid = get_active_foreground_pid();
    let report = trim_idle_background_processes(100 * 1024 * 1024);
    assert_eq!(report.foreground_pid_protected, fg_pid);
    if fg_pid != 0 {
        for detail in &report.details {
            assert_ne!(
                detail.pid, fg_pid,
                "Active foreground PID {} must never be added to trim list",
                fg_pid
            );
        }
    }
}

#[test]
fn test_system_pids_excluded() {
    let report = trim_idle_background_processes(50 * 1024 * 1024);
    for detail in &report.details {
        assert_ne!(detail.pid, 0, "System Idle process (PID 0) must be excluded");
        assert_ne!(detail.pid, 4, "System process (PID 4) must be excluded");
    }
}

#[test]
fn test_memory_trim_execution() {
    // Execute on live Windows processes with 200 MB threshold
    let report = trim_idle_background_processes(200 * 1024 * 1024);
    println!(
        "Scanned {} processes | Trimmed: {} | Total Reclaimed: {:.2} MB",
        report.processes_scanned, report.processes_trimmed, report.total_mb_reclaimed
    );

    assert!(
        report.processes_scanned > 0,
        "Memory shield must scan running system processes"
    );
    assert!(
        report.total_mb_reclaimed >= 0.0,
        "Total reclaimed memory in MB cannot be negative"
    );
    assert_eq!(
        report.details.len(),
        report.processes_trimmed,
        "Detail records count must match processes_trimmed counter"
    );

    for detail in &report.details {
        assert!(
            detail.ws_before_bytes >= detail.ws_after_bytes,
            "Working set after trim must not exceed working set before trim"
        );
        assert_eq!(
            detail.reclaimed_bytes,
            detail.ws_before_bytes.saturating_sub(detail.ws_after_after_bytes_check(detail.ws_after_bytes)),
            "Reclaimed bytes must equal delta between before and after"
        );
    }
}

trait DetailDeltaExt {
    fn ws_after_after_bytes_check(&self, v: u64) -> u64;
}

impl DetailDeltaExt for potatoclaw_lib::memory_shield::ProcessTrimDetail {
    fn ws_after_after_bytes_check(&self, v: u64) -> u64 {
        v
    }
}

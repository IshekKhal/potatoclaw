use std::fs;
use std::path::Path;
use potatoclaw_lib::memory_shield::{get_active_foreground_pid, trim_idle_background_processes};
use potatoclaw_lib::screen_capture::capture_screen_region;

#[test]
fn test_screen_capture_primary() {
    let result = capture_screen_region(0, 0, 100, 100);
    println!("capture_screen_region result: {:?}", result);
    assert!(result.is_ok(), "Screen capture must succeed: {:?}", result.err());

    let file_path_str = result.unwrap();
    let path = Path::new(&file_path_str);

    assert!(path.exists(), "Captured PNG file must exist at path: {:?}", path);
    assert!(
        file_path_str.ends_with(".png"),
        "Captured file must have a .png extension"
    );

    let metadata = fs::metadata(path).expect("Failed to read captured file metadata");
    assert!(
        metadata.len() > 0,
        "Captured PNG must have non-zero file size, got {} bytes",
        metadata.len()
    );

    println!(
        "Successfully captured screen region: {} ({} bytes)",
        file_path_str,
        metadata.len()
    );

    // Clean up temporary test file
    let _ = fs::remove_file(path);
}

#[test]
fn test_memory_shield_integrity() {
    let fg_pid = get_active_foreground_pid();
    let report = trim_idle_background_processes(100 * 1024 * 1024);

    assert!(
        report.processes_scanned > 0,
        "Processes scanned must be greater than zero"
    );
    assert!(
        report.total_mb_reclaimed >= 0.0,
        "Total reclaimed memory in MB must not be negative"
    );

    // Assert foreground PID protection
    if fg_pid != 0 {
        for detail in &report.details {
            assert_ne!(
                detail.pid, fg_pid,
                "Foreground PID {} must be strictly protected from working set trim",
                fg_pid
            );
        }
    }

    // Assert system PIDs 0 and 4 exclusion
    for detail in &report.details {
        assert_ne!(detail.pid, 0, "PID 0 (System Idle) must be excluded");
        assert_ne!(detail.pid, 4, "PID 4 (System) must be excluded");
    }

    println!(
        "Memory Shield integrity verified: scanned {}, trimmed {}, reclaimed {:.2} MB",
        report.processes_scanned, report.processes_trimmed, report.total_mb_reclaimed
    );
}

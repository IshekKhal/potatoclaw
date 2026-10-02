use tauri::{AppHandle, Manager};
use crate::memory_shield::{
    get_active_foreground_pid, trim_current_process, trim_idle_background_processes, TrimReport,
};

#[tauri::command]
pub fn trim_memory(threshold_mb: Option<u64>) -> Result<TrimReport, String> {
    let threshold_bytes = threshold_mb.unwrap_or(100) * 1024 * 1024;
    let report = trim_idle_background_processes(threshold_bytes as usize);
    trim_current_process();
    Ok(report)
}

#[tauri::command]
pub fn get_foreground_process() -> Result<u32, String> {
    Ok(get_active_foreground_pid())
}

#[tauri::command]
pub fn toggle_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        if window.is_visible().map_err(|e| e.to_string())? {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
        Ok(())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

#[tauri::command]
pub fn hide_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.hide().map_err(|e| e.to_string())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

#[tauri::command]
pub fn show_window(app: AppHandle, label: String) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&label) {
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())
    } else {
        Err(format!("Window '{}' not found", label))
    }
}

#[tauri::command]
pub fn capture_screen_region(x: u32, y: u32, width: u32, height: u32) -> Result<String, String> {
    crate::screen_capture::capture_screen_region(x, y, width, height)
}


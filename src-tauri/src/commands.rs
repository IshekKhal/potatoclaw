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

#[tauri::command]
pub async fn verify_connection(
    backend_url: Option<String>,
    access_code: Option<String>,
) -> Result<serde_json::Value, String> {
    crate::network_gateway::dispatch_verify_auth(backend_url, access_code).await
}

#[tauri::command]
pub async fn send_process_payload(
    prompt: String,
    data_type: String,
    file_path: Option<String>,
    file_paths: Option<Vec<String>>,
    backend_url: Option<String>,
    access_code: Option<String>,
) -> Result<serde_json::Value, String> {
    crate::network_gateway::dispatch_process(prompt, data_type, file_path, file_paths, backend_url, access_code).await
}

#[tauri::command]
pub fn start_voice_recording() -> Result<(), String> {
    crate::audio_engine::start_recording()
}

#[tauri::command]
pub async fn stop_voice_recording(
    transcribe: Option<bool>,
    backend_url: Option<String>,
    access_code: Option<String>,
) -> Result<serde_json::Value, String> {
    let audio_path = crate::audio_engine::stop_recording()?;
    let should_transcribe = transcribe.unwrap_or(true);

    if should_transcribe {
        match crate::network_gateway::dispatch_transcribe(audio_path.clone(), backend_url, access_code).await {
            Ok(transcription) => Ok(serde_json::json!({
                "status": "success",
                "audio_path": audio_path,
                "transcription": transcription,
            })),
            Err(err) => Ok(serde_json::json!({
                "status": "error",
                "audio_path": audio_path,
                "transcription": "",
                "error": err,
            })),
        }
    } else {
        Ok(serde_json::json!({
            "status": "success",
            "audio_path": audio_path,
            "transcription": "",
        }))
    }
}

#[tauri::command]
pub async fn synthesize_speech(
    text: String,
    backend_url: Option<String>,
    access_code: Option<String>,
) -> Result<Vec<u8>, String> {
    crate::network_gateway::dispatch_speak(text, backend_url, access_code).await
}

#[tauri::command]
pub fn get_clipboard_text() -> Result<String, String> {
    unsafe {
        use windows::Win32::Foundation::HGLOBAL;
        use windows::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
        use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};

        let mut opened = false;
        for _ in 0..10 {
            if OpenClipboard(None).is_ok() {
                opened = true;
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(25));
        }
        if !opened {
            return Err("Failed to open system clipboard after retries".to_string());
        }

        // CF_UNICODETEXT = 13, CF_TEXT = 1
        let handle = match GetClipboardData(13) {
            Ok(h) => h,
            Err(_) => match GetClipboardData(1) {
                Ok(h) => h,
                Err(e) => {
                    let _ = CloseClipboard();
                    return Err(format!("No text in clipboard: {}", e));
                }
            },
        };

        if handle.0.is_null() {
            let _ = CloseClipboard();
            return Err("Clipboard handle is null".to_string());
        }

        let ptr = GlobalLock(HGLOBAL(handle.0));
        if ptr.is_null() {
            let _ = CloseClipboard();
            return Err("Failed to lock clipboard memory".to_string());
        }

        let u16_ptr = ptr as *const u16;
        let mut len = 0;
        while *u16_ptr.add(len) != 0 {
            len += 1;
        }

        let slice = std::slice::from_raw_parts(u16_ptr, len);
        let text = String::from_utf16_lossy(slice);

        let _ = GlobalUnlock(HGLOBAL(handle.0));
        let _ = CloseClipboard();

        Ok(text)
    }
}


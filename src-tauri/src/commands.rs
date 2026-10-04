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
    backend_url: Option<String>,
    access_code: Option<String>,
) -> Result<serde_json::Value, String> {
    crate::network_gateway::dispatch_process(prompt, data_type, file_path, backend_url, access_code).await
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

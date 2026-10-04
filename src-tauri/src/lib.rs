pub mod audio_engine;
pub mod commands;
pub mod hotkeys;
pub mod memory_shield;
pub mod network_gateway;
pub mod screen_capture;
pub mod tray;

use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(hotkeys::build_shortcut_plugin())
        .setup(|app| {
            hotkeys::register_hotkeys(app.handle());
            tray::setup_tray(app.handle())?;
            if let Some(window) = app.get_webview_window("dropbox") {
                let _ = window.set_shadow(false);
                let _ = window.set_decorations(false);
            }
            if let Some(window) = app.get_webview_window("snipper") {
                let _ = window.set_shadow(false);
                let _ = window.set_decorations(false);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            trim_memory,
            get_foreground_process,
            toggle_window,
            hide_window,
            show_window,
            capture_screen_region,
            verify_connection,
            send_process_payload,
            start_voice_recording,
            stop_voice_recording,
            synthesize_speech
        ])
        .run(tauri::generate_context!())
        .expect("error while running PotatoClaw application");
}

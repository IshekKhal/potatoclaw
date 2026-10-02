pub mod commands;
pub mod hotkeys;
pub mod memory_shield;
pub mod tray;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(hotkeys::build_shortcut_plugin())
        .setup(|app| {
            tray::setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            trim_memory,
            get_foreground_process,
            toggle_window,
            hide_window,
            show_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running PotatoClaw application");
}

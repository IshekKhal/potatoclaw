use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};
use crate::memory_shield::trim_idle_background_processes;

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show_hud = MenuItemBuilder::new("Show HUD").id("show_hud").build(app)?;
    let trim_mem = MenuItemBuilder::new("Trim Memory Now").id("trim_mem").build(app)?;
    let quit_item = MenuItemBuilder::new("Quit PotatoClaw").id("quit").build(app)?;

    let menu = MenuBuilder::new(app)
        .item(&show_hud)
        .item(&trim_mem)
        .separator()
        .item(&quit_item)
        .build()?;

    let icon = app.default_window_icon().cloned().ok_or("Failed to get window icon")?;

    let _tray = TrayIconBuilder::with_id("potatoclaw-tray")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "show_hud" => {
                    if let Some(hud) = app.get_webview_window("hud") {
                        let _ = hud.show();
                        let _ = hud.set_focus();
                    }
                }
                "trim_mem" => {
                    let report = trim_idle_background_processes(100 * 1024 * 1024);
                    let _ = app.emit("memory-trimmed", report);
                }
                "quit" => {
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(hud) = app.get_webview_window("hud") {
                    if hud.is_visible().unwrap_or(false) {
                        let _ = hud.hide();
                    } else {
                        let _ = hud.show();
                        let _ = hud.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

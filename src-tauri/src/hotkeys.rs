use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{
    Builder as ShortcutBuilder, Code, GlobalShortcutExt, Modifiers, ShortcutState,
};

pub fn build_shortcut_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    ShortcutBuilder::new()
        .with_handler(|app, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let matches_mod = shortcut.mods.contains(Modifiers::ALT)
                    && shortcut.mods.contains(Modifiers::SHIFT);

                if matches_mod && shortcut.key == Code::Digit1 {
                    let text = crate::commands::get_clipboard_text().unwrap_or_default();
                    let _ = app.emit("trigger-clipboard-ingest", serde_json::json!({ "text": text }));
                    if let Some(hud) = app.get_webview_window("hud") {
                        let _ = hud.show();
                        let _ = hud.set_focus();
                    }
                } else if matches_mod && shortcut.key == Code::Digit2 {
                    let _ = app.emit("trigger-screen-snip", ());
                    if let Some(snipper) = app.get_webview_window("snipper") {
                        let _ = snipper.show();
                        let _ = snipper.set_focus();
                    }
                } else if matches_mod && shortcut.key == Code::KeyV {
                    let _ = app.emit("trigger-voice-toggle", ());
                } else if matches_mod && shortcut.key == Code::KeyP {
                    let _ = app.emit("trigger-hud-toggle", ());
                    if let Some(hud) = app.get_webview_window("hud") {
                        if hud.is_visible().unwrap_or(false) {
                            let _ = hud.hide();
                        } else {
                            let _ = hud.show();
                            let _ = hud.set_focus();
                        }
                    }
                }
            }
        })
        .build()
}

pub fn register_hotkeys(app: &AppHandle) {
    let shortcuts = ["alt+shift+p", "alt+shift+1", "alt+shift+2", "alt+shift+v"];
    for sc in shortcuts {
        if let Err(err) = app.global_shortcut().register(sc) {
            eprintln!("[WARN] Failed to register global shortcut '{}': {}", sc, err);
        }
    }
}

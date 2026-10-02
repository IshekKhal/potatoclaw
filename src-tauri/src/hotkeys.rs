use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{Builder as ShortcutBuilder, Code, Modifiers, ShortcutState};

pub fn build_shortcut_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    ShortcutBuilder::new()
        .with_shortcuts(["alt+shift+1", "alt+shift+2", "alt+shift+v", "alt+shift+p"])
        .expect("Failed to register global shortcuts")
        .with_handler(|app, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                let matches_mod = shortcut.mods.contains(Modifiers::ALT)
                    && shortcut.mods.contains(Modifiers::SHIFT);

                if matches_mod && shortcut.key == Code::Digit1 {
                    let _ = app.emit("trigger-clipboard-ingest", ());
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

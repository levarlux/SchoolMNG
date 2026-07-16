use serde::Deserialize;
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;

#[derive(Deserialize, Default)]
struct UpdaterConfig {
    preview: bool,
    preview_tag: Option<String>,
}

fn config_path() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("schoolmng")
        .join("updater.json")
}

fn load_updater_config() -> UpdaterConfig {
    let path = config_path();
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

const STABLE_ENDPOINT: &str =
    "https://github.com/levarlux/SchoolMNG/releases/latest/download/latest.json";

async fn check_and_prompt_update(app: tauri::AppHandle) {
    let config = load_updater_config();

    let endpoint = if config.preview {
        config
            .preview_tag
            .map(|tag| {
                format!(
                    "https://github.com/levarlux/SchoolMNG/releases/download/{}/latest.json",
                    tag
                )
            })
            .unwrap_or_else(|| STABLE_ENDPOINT.into())
    } else {
        STABLE_ENDPOINT.into()
    };

    let url: url::Url = match endpoint.parse() {
        Ok(u) => u,
        Err(_) => return,
    };

    let updater_check = app
        .updater_builder()
        .endpoints(vec![url])
        .unwrap()
        .build()
        .unwrap()
        .check()
        .await;

    if let Ok(Some(update)) = updater_check {
        let should_install = app
            .dialog()
            .message(format!(
                "A new version ({}) is available.\nWould you like to install it now?",
                update.version
            ))
            .title("Update Available")
            .blocking_show();

        if should_install {
            let _ = update
                .download_and_install(|_, _| {}, || {})
                .await;
            app.restart();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_and_prompt_update(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

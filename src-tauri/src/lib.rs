use serde::Deserialize;
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::UpdaterExt;

// --- GitHub API types for prerelease auto-discovery ---

#[derive(Deserialize, Debug)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize, Debug)]
struct GitHubRelease {
    prerelease: bool,
    draft: bool,
    assets: Vec<GitHubAsset>,
}

// --- Local updater config ---

#[derive(Deserialize, Default)]
struct UpdaterConfig {
    preview: bool,
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

// --- Constants ---

const GITHUB_API_RELEASES: &str =
    "https://api.github.com/repos/levarlux/SchoolMNG/releases?per_page=20";

const STABLE_LATEST_JSON: &str =
    "https://github.com/levarlux/SchoolMNG/releases/latest/download/latest.json";

// --- Auto-discovery: find the latest prerelease's latest.json URL ---

async fn fetch_latest_prerelease_url() -> Result<String, Box<dyn std::error::Error>> {
    let client = reqwest::Client::builder()
        .user_agent("SchoolMNG-Updater/2.0")
        .build()?;

    let releases: Vec<GitHubRelease> = client
        .get(GITHUB_API_RELEASES)
        .send()
        .await?
        .json()
        .await?;

    let latest_prerelease = releases
        .into_iter()
        .find(|r| r.prerelease && !r.draft);

    if let Some(release) = latest_prerelease {
        if let Some(asset) = release.assets.into_iter().find(|a| a.name == "latest.json") {
            return Ok(asset.browser_download_url);
        }
    }

    Err("No prerelease with latest.json found".into())
}

// --- Main update logic ---

async fn check_and_prompt_update(app: tauri::AppHandle) {
    let config = load_updater_config();

    let endpoint = if config.preview {
        fetch_latest_prerelease_url()
            .await
            .unwrap_or_else(|_| STABLE_LATEST_JSON.into())
    } else {
        STABLE_LATEST_JSON.into()
    };

    let url = match endpoint.parse() {
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
            app.dialog()
                .message("Downloading update... The app will restart automatically when ready.")
                .title("Downloading Update")
                .show(|_| {});

            if update
                .download_and_install(|_, _| {}, || {})
                .await
                .is_ok()
            {
                app.restart();
            }
        }
    }
}

// --- Entry point ---

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_clerk::ClerkPluginBuilder::new()
                .publishable_key(
                    option_env!("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
                        .unwrap_or("") // empty → Clerk will error visibly if key wasn't embedded at compile time
                        .to_string()
                )
                .with_tauri_store()
                .build()
        )
        .setup(|app| {
            // Set the window icon at runtime from embedded bytes
            if let Some(window) = app.get_webview_window("main") {
                let icon = tauri::include_image!("icons/icon.ico");
                // Fixed: Passed raw Image directly, avoiding Option mismatch[cite: 1]
                let _ = window.set_icon(icon); 
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                check_and_prompt_update(handle).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
mod commands;
mod managers;
mod settings;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();
            let ffmpeg_mgr = managers::ffmpeg::FfmpegManager::new();
            if let Some(path) = ffmpeg_mgr.binary_path() {
                log::info!("FFmpeg found: {}", path.display());
            } else {
                log::warn!("FFmpeg not found on system");
            }

            app.manage(managers::AppState::new(app_handle));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_ffmpeg_status,
            commands::queue_files,
            commands::get_system_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HandyFiles");
}

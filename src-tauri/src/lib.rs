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
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            let state = managers::AppState::new(app_handle);

            if state.ffmpeg.is_available() {
                log::info!("FFmpeg found: {}", state.ffmpeg.binary_path().unwrap().display());
            } else {
                log::warn!("FFmpeg not found on system");
            }

            log::info!("Models directory: {}", state.models.models_dir().display());

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Models
            commands::get_models,
            commands::download_model,
            commands::delete_model,
            commands::select_model,
            commands::get_selected_model,
            commands::set_language,
            commands::get_language,
            // Decoder
            commands::get_decoder_status,
            // File queue
            commands::queue_files,
            commands::get_queue,
            commands::clear_completed,
            commands::reset_file_for_retranscribe,
            commands::cancel_transcription,
            // Transcription
            commands::transcribe_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running HandyFiles");
}

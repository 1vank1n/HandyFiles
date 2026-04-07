use tauri::State;
use crate::managers::{AppState, QueuedFile, FileStatus};

#[derive(serde::Serialize)]
pub struct FfmpegStatus {
    pub available: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub fn get_ffmpeg_status(state: State<AppState>) -> FfmpegStatus {
    FfmpegStatus {
        available: state.ffmpeg.is_available(),
        path: state.ffmpeg.binary_path().map(|p| p.display().to_string()),
    }
}

#[derive(serde::Serialize)]
pub struct SystemInfo {
    pub ffmpeg: FfmpegStatus,
    pub app_version: String,
}

#[tauri::command]
pub fn get_system_info(state: State<AppState>) -> SystemInfo {
    SystemInfo {
        ffmpeg: get_ffmpeg_status(state),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn queue_files(paths: Vec<String>, state: State<AppState>) -> Result<Vec<QueuedFile>, String> {
    let supported_extensions = [
        "mp4", "mkv", "mov", "avi", "webm",
        "mp3", "wav", "flac", "ogg", "m4a", "aac", "wma",
    ];

    let mut files = Vec::new();

    for path in paths {
        let p = std::path::Path::new(&path);

        // Validate extension
        let ext = p.extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !supported_extensions.contains(&ext.as_str()) {
            continue;
        }

        // Validate file exists
        if !p.is_file() {
            continue;
        }

        let filename = p.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let file = QueuedFile {
            id: uuid::Uuid::new_v4().to_string(),
            path: path.clone(),
            filename,
            status: FileStatus::Queued,
        };

        files.push(file.clone());
    }

    // Add to state
    if let Ok(mut queue) = state.queued_files.lock() {
        queue.extend(files.clone());
    }

    Ok(files)
}

pub mod ffmpeg;

use std::sync::Mutex;
use tauri::AppHandle;

use ffmpeg::FfmpegManager;

pub struct AppState {
    pub app_handle: AppHandle,
    pub ffmpeg: FfmpegManager,
    pub queued_files: Mutex<Vec<QueuedFile>>,
}

impl AppState {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            ffmpeg: FfmpegManager::new(),
            queued_files: Mutex::new(Vec::new()),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct QueuedFile {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub status: FileStatus,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Queued,
    Converting,
    Transcribing,
    Completed,
    Error(String),
}

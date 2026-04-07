pub mod audio;
pub mod ffmpeg;
pub mod model;
pub mod transcription;

use std::sync::Mutex;

use serde::Serialize;
use tauri::AppHandle;

use ffmpeg::FfmpegManager;
use model::ModelManager;
use transcription::TranscriptionManager;

pub struct AppState {
    pub app_handle: AppHandle,
    pub ffmpeg: FfmpegManager,
    pub models: ModelManager,
    pub transcription: TranscriptionManager,
    pub queued_files: Mutex<Vec<QueuedFile>>,
    pub selected_model: Mutex<Option<String>>,
    pub selected_language: Mutex<String>,
}

impl AppState {
    pub fn new(app_handle: AppHandle) -> Self {
        let models = ModelManager::new(&app_handle);
        Self {
            app_handle,
            ffmpeg: FfmpegManager::new(),
            models,
            transcription: TranscriptionManager::new(),
            queued_files: Mutex::new(Vec::new()),
            selected_model: Mutex::new(None),
            selected_language: Mutex::new("ru".to_string()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QueuedFile {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub status: FileStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Queued,
    Converting,
    Transcribing,
    Completed,
    Error,
}

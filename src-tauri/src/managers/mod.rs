pub mod audio;
pub mod ffmpeg;
pub mod model;
pub mod transcription;

use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use ffmpeg::FfmpegManager;
use model::ModelManager;
use transcription::TranscriptionManager;

/// Persisted preferences (saved to app data dir).
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Preferences {
    selected_model: Option<String>,
    language: Option<String>,
}

impl Preferences {
    fn load(path: &PathBuf) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    fn save(&self, path: &PathBuf) {
        if let Ok(json) = serde_json::to_string_pretty(self) {
            std::fs::write(path, json).ok();
        }
    }
}

pub struct AppState {
    pub app_handle: AppHandle,
    pub ffmpeg: FfmpegManager,
    pub models: ModelManager,
    pub transcription: TranscriptionManager,
    pub queued_files: Mutex<Vec<QueuedFile>>,
    pub selected_model: Mutex<Option<String>>,
    pub selected_language: Mutex<String>,
    pub cancelled: Mutex<HashSet<String>>,
    prefs_path: PathBuf,
}

impl AppState {
    pub fn new(app_handle: AppHandle) -> Self {
        let models = ModelManager::new(&app_handle);

        let prefs_path = app_handle
            .path()
            .app_data_dir()
            .expect("failed to get app data dir")
            .join("preferences.json");

        let prefs = Preferences::load(&prefs_path);

        // Restore selected model only if it's still downloaded
        let selected_model = prefs
            .selected_model
            .filter(|id| models.get_model_path_by_id(id).is_some());

        let language = prefs.language.unwrap_or_else(|| "ru".to_string());

        if let Some(ref id) = selected_model {
            log::info!("Restored selected model: {}", id);
        }

        Self {
            app_handle,
            ffmpeg: FfmpegManager::new(),
            models,
            transcription: TranscriptionManager::new(),
            queued_files: Mutex::new(Vec::new()),
            selected_model: Mutex::new(selected_model),
            selected_language: Mutex::new(language),
            cancelled: Mutex::new(HashSet::new()),
            prefs_path,
        }
    }

    /// Save current preferences to disk.
    pub fn save_preferences(&self) {
        let prefs = Preferences {
            selected_model: self.selected_model.lock().unwrap().clone(),
            language: Some(self.selected_language.lock().unwrap().clone()),
        };
        prefs.save(&self.prefs_path);
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QueuedFile {
    pub id: String,
    pub path: String,
    pub filename: String,
    pub is_video: bool,
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

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};

/// Available whisper model definitions.
/// URLs point to Hugging Face ggml model files.
pub fn get_model_registry() -> Vec<ModelDef> {
    vec![
        ModelDef {
            id: "whisper-tiny".into(),
            name: "Whisper Tiny".into(),
            description: "Самая быстрая, низкое качество (~75MB)".into(),
            filename: "ggml-tiny.bin".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin".into(),
            size_mb: 75,
            engine: EngineType::Whisper,
        },
        ModelDef {
            id: "whisper-base".into(),
            name: "Whisper Base".into(),
            description: "Быстрая, приемлемое качество (~142MB)".into(),
            filename: "ggml-base.bin".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin".into(),
            size_mb: 142,
            engine: EngineType::Whisper,
        },
        ModelDef {
            id: "whisper-small".into(),
            name: "Whisper Small".into(),
            description: "Хороший баланс скорости и качества (~466MB)".into(),
            filename: "ggml-small.bin".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin".into(),
            size_mb: 466,
            engine: EngineType::Whisper,
        },
        ModelDef {
            id: "whisper-medium".into(),
            name: "Whisper Medium".into(),
            description: "Высокое качество, медленнее (~1.5GB)".into(),
            filename: "ggml-medium.bin".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin".into(),
            size_mb: 1500,
            engine: EngineType::Whisper,
        },
        ModelDef {
            id: "whisper-large-v3".into(),
            name: "Whisper Large v3".into(),
            description: "Лучшее качество, самая медленная (~3GB)".into(),
            filename: "ggml-large-v3.bin".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin".into(),
            size_mb: 3000,
            engine: EngineType::Whisper,
        },
        ModelDef {
            id: "whisper-large-v3-turbo".into(),
            name: "Whisper Large v3 Turbo".into(),
            description: "Качество large, скорость medium (~1.6GB)".into(),
            filename: "ggml-large-v3-turbo.bin".into(),
            url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin".into(),
            size_mb: 1600,
            engine: EngineType::Whisper,
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelDef {
    pub id: String,
    pub name: String,
    pub description: String,
    pub filename: String,
    pub url: String,
    pub size_mb: u64,
    pub engine: EngineType,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum EngineType {
    Whisper,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModelInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub engine: EngineType,
    pub size_mb: u64,
    pub is_downloaded: bool,
    pub is_downloading: bool,
    pub download_progress: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadProgress {
    pub model_id: String,
    pub progress: f64,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub speed_bps: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadComplete {
    pub model_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct DownloadError {
    pub model_id: String,
    pub error: String,
}

pub struct ModelManager {
    models_dir: PathBuf,
    downloading: Mutex<Vec<String>>,
}

impl ModelManager {
    pub fn new(app_handle: &AppHandle) -> Self {
        let models_dir = app_handle
            .path()
            .app_data_dir()
            .expect("failed to get app data dir")
            .join("models");

        fs::create_dir_all(&models_dir).ok();

        Self {
            models_dir,
            downloading: Mutex::new(Vec::new()),
        }
    }

    pub fn models_dir(&self) -> &Path {
        &self.models_dir
    }

    pub fn get_models(&self) -> Vec<ModelInfo> {
        let registry = get_model_registry();
        let downloading = self.downloading.lock().unwrap();

        registry
            .iter()
            .map(|def| {
                let is_downloaded = self.model_path(def).is_some();
                let is_downloading = downloading.contains(&def.id);
                ModelInfo {
                    id: def.id.clone(),
                    name: def.name.clone(),
                    description: def.description.clone(),
                    engine: def.engine.clone(),
                    size_mb: def.size_mb,
                    is_downloaded,
                    is_downloading,
                    download_progress: 0.0,
                }
            })
            .collect()
    }

    /// Returns the path to the model file if it's downloaded.
    pub fn model_path(&self, def: &ModelDef) -> Option<PathBuf> {
        let path = self.models_dir.join(&def.filename);
        if path.is_file() {
            Some(path)
        } else {
            None
        }
    }

    /// Returns the path to a downloaded model by ID.
    pub fn get_model_path_by_id(&self, model_id: &str) -> Option<PathBuf> {
        let registry = get_model_registry();
        registry
            .iter()
            .find(|d| d.id == model_id)
            .and_then(|def| self.model_path(def))
    }

    /// Download a model with progress reporting.
    pub async fn download_model(
        &self,
        model_id: &str,
        app_handle: &AppHandle,
    ) -> Result<(), String> {
        let registry = get_model_registry();
        let def = registry
            .iter()
            .find(|d| d.id == model_id)
            .ok_or_else(|| format!("Модель {model_id} не найдена"))?
            .clone();

        // Mark as downloading
        {
            let mut downloading = self.downloading.lock().unwrap();
            if downloading.contains(&def.id) {
                return Err("Модель уже скачивается".into());
            }
            downloading.push(def.id.clone());
        }

        let result = self.do_download(&def, app_handle).await;

        // Unmark downloading
        {
            let mut downloading = self.downloading.lock().unwrap();
            downloading.retain(|id| id != &def.id);
        }

        match &result {
            Ok(()) => {
                let _ = app_handle.emit(
                    "model-download-complete",
                    DownloadComplete {
                        model_id: def.id.clone(),
                    },
                );
            }
            Err(e) => {
                let _ = app_handle.emit(
                    "model-download-error",
                    DownloadError {
                        model_id: def.id.clone(),
                        error: e.clone(),
                    },
                );
            }
        }

        result
    }

    async fn do_download(
        &self,
        def: &ModelDef,
        app_handle: &AppHandle,
    ) -> Result<(), String> {
        let output_path = self.models_dir.join(&def.filename);
        let partial_path = self.models_dir.join(format!("{}.partial", def.filename));

        // Check for existing partial download (resume support)
        let mut downloaded_bytes: u64 = 0;
        if partial_path.is_file() {
            downloaded_bytes = fs::metadata(&partial_path)
                .map(|m| m.len())
                .unwrap_or(0);
        }

        let client = reqwest::Client::new();
        let mut request = client.get(&def.url);

        // Resume from where we left off
        if downloaded_bytes > 0 {
            request = request.header("Range", format!("bytes={}-", downloaded_bytes));
            log::info!(
                "Resuming download of {} from {} bytes",
                def.id,
                downloaded_bytes
            );
        }

        let response = request
            .send()
            .await
            .map_err(|e| format!("Ошибка загрузки: {e}"))?;

        if !response.status().is_success() && response.status().as_u16() != 206 {
            return Err(format!("HTTP ошибка: {}", response.status()));
        }

        let total_bytes = if response.status().as_u16() == 206 {
            // Partial content - get total from Content-Range header
            response
                .headers()
                .get("content-range")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split('/').last())
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(def.size_mb * 1024 * 1024)
        } else {
            downloaded_bytes = 0; // Server doesn't support resume, start over
            response.content_length().unwrap_or(def.size_mb * 1024 * 1024)
        };

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(downloaded_bytes > 0)
            .write(true)
            .truncate(downloaded_bytes == 0)
            .open(&partial_path)
            .map_err(|e| format!("Ошибка создания файла: {e}"))?;

        let mut stream = response.bytes_stream();
        let mut last_emit = std::time::Instant::now();
        let mut speed_bytes: u64 = 0;
        let mut speed_time = std::time::Instant::now();

        while let Some(chunk) = stream.next().await {
            let chunk = chunk.map_err(|e| format!("Ошибка загрузки: {e}"))?;
            file.write_all(&chunk)
                .map_err(|e| format!("Ошибка записи: {e}"))?;

            downloaded_bytes += chunk.len() as u64;
            speed_bytes += chunk.len() as u64;

            // Emit progress every 200ms
            if last_emit.elapsed().as_millis() >= 200 {
                let elapsed = speed_time.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    (speed_bytes as f64 / elapsed) as u64
                } else {
                    0
                };

                let _ = app_handle.emit(
                    "model-download-progress",
                    DownloadProgress {
                        model_id: def.id.clone(),
                        progress: downloaded_bytes as f64 / total_bytes as f64,
                        downloaded_bytes,
                        total_bytes,
                        speed_bps: speed,
                    },
                );

                last_emit = std::time::Instant::now();
                speed_bytes = 0;
                speed_time = std::time::Instant::now();
            }
        }

        file.flush().map_err(|e| format!("Ошибка записи: {e}"))?;
        drop(file);

        // Rename partial to final
        fs::rename(&partial_path, &output_path)
            .map_err(|e| format!("Ошибка переименования: {e}"))?;

        log::info!("Model {} downloaded to {}", def.id, output_path.display());
        Ok(())
    }

    /// Delete a downloaded model.
    pub fn delete_model(&self, model_id: &str) -> Result<(), String> {
        let registry = get_model_registry();
        let def = registry
            .iter()
            .find(|d| d.id == model_id)
            .ok_or_else(|| format!("Модель {model_id} не найдена"))?;

        let path = self.models_dir.join(&def.filename);
        if path.is_file() {
            fs::remove_file(&path).map_err(|e| format!("Ошибка удаления: {e}"))?;
        }

        // Also remove partial file if exists
        let partial = self.models_dir.join(format!("{}.partial", def.filename));
        if partial.is_file() {
            fs::remove_file(&partial).ok();
        }

        Ok(())
    }
}

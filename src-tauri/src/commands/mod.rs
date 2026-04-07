use std::path::Path;

use tauri::{AppHandle, Emitter, State};

use crate::managers::{AppState, FileStatus, QueuedFile};
use crate::managers::model::ModelInfo;

// ── Model commands ──────────────────────────────────────────────

#[tauri::command]
pub fn get_models(state: State<AppState>) -> Vec<ModelInfo> {
    state.models.get_models()
}

#[tauri::command]
pub async fn download_model(
    model_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let app_handle = state.app_handle.clone();
    state.models.download_model(&model_id, &app_handle).await
}

#[tauri::command]
pub fn delete_model(model_id: String, state: State<AppState>) -> Result<(), String> {
    state.models.delete_model(&model_id)
}

#[tauri::command]
pub fn select_model(model_id: String, state: State<AppState>) -> Result<(), String> {
    // Verify model exists
    let path = state.models.get_model_path_by_id(&model_id);
    if path.is_none() {
        return Err("Модель не скачана".into());
    }
    let mut selected = state.selected_model.lock().unwrap();
    *selected = Some(model_id);
    Ok(())
}

#[tauri::command]
pub fn get_selected_model(state: State<AppState>) -> Option<String> {
    state.selected_model.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_language(language: String, state: State<AppState>) {
    let mut lang = state.selected_language.lock().unwrap();
    *lang = language;
}

#[tauri::command]
pub fn get_language(state: State<AppState>) -> String {
    state.selected_language.lock().unwrap().clone()
}

// ── FFmpeg commands ─────────────────────────────────────────────

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

// ── File queue commands ─────────────────────────────────────────

#[tauri::command]
pub fn queue_files(paths: Vec<String>, state: State<AppState>) -> Result<Vec<QueuedFile>, String> {
    let supported_extensions = [
        "mp4", "mkv", "mov", "avi", "webm",
        "mp3", "wav", "flac", "ogg", "m4a", "aac", "wma",
    ];

    let mut files = Vec::new();

    for path in paths {
        let p = Path::new(&path);

        let ext = p
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();

        if !supported_extensions.contains(&ext.as_str()) || !p.is_file() {
            continue;
        }

        let filename = p
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let file = QueuedFile {
            id: uuid::Uuid::new_v4().to_string(),
            path: path.clone(),
            filename,
            status: FileStatus::Queued,
            result: None,
            duration_ms: None,
            error: None,
        };

        files.push(file.clone());
    }

    if let Ok(mut queue) = state.queued_files.lock() {
        queue.extend(files.clone());
    }

    Ok(files)
}

#[tauri::command]
pub fn get_queue(state: State<AppState>) -> Vec<QueuedFile> {
    state.queued_files.lock().unwrap().clone()
}

#[tauri::command]
pub fn clear_completed(state: State<AppState>) {
    let mut queue = state.queued_files.lock().unwrap();
    queue.retain(|f| f.status != FileStatus::Completed && f.status != FileStatus::Error);
}

// ── Transcription commands ──────────────────────────────────────

#[derive(Clone, serde::Serialize)]
struct TranscriptionEvent {
    file_id: String,
    status: FileStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[tauri::command]
pub async fn transcribe_file(
    file_id: String,
    app_handle: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Get file info
    let (path, filename) = {
        let queue = state.queued_files.lock().unwrap();
        let file = queue
            .iter()
            .find(|f| f.id == file_id)
            .ok_or("Файл не найден в очереди")?;
        (file.path.clone(), file.filename.clone())
    };

    // Get selected model
    let model_id = {
        state
            .selected_model
            .lock()
            .unwrap()
            .clone()
            .ok_or("Модель не выбрана")?
    };

    let language = state.selected_language.lock().unwrap().clone();

    // Get model path
    let model_path = state
        .models
        .get_model_path_by_id(&model_id)
        .ok_or("Модель не скачана")?;

    let input_path = Path::new(&path);

    // Update status → converting
    update_file_status(&state, &file_id, FileStatus::Converting, None, None, None);
    let _ = app_handle.emit(
        "transcription-update",
        TranscriptionEvent {
            file_id: file_id.clone(),
            status: FileStatus::Converting,
            text: None,
            duration_ms: None,
            error: None,
        },
    );

    // Step 1: Convert to WAV if needed
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let wav_path = if ext == "wav" {
        // Check if already 16kHz mono - for simplicity, always convert
        input_path.to_path_buf()
    } else {
        // Need FFmpeg
        if !state.ffmpeg.is_available() {
            let err = "FFmpeg не найден".to_string();
            update_file_status(&state, &file_id, FileStatus::Error, None, None, Some(err.clone()));
            let _ = app_handle.emit(
                "transcription-update",
                TranscriptionEvent {
                    file_id,
                    status: FileStatus::Error,
                    text: None,
                    duration_ms: None,
                    error: Some(err),
                },
            );
            return Err("FFmpeg не найден".into());
        }

        log::info!("Converting {} via FFmpeg", filename);
        match state.ffmpeg.extract_audio(input_path) {
            Ok(p) => p,
            Err(e) => {
                update_file_status(&state, &file_id, FileStatus::Error, None, None, Some(e.clone()));
                let _ = app_handle.emit(
                    "transcription-update",
                    TranscriptionEvent {
                        file_id,
                        status: FileStatus::Error,
                        text: None,
                        duration_ms: None,
                        error: Some(e.clone()),
                    },
                );
                return Err(e);
            }
        }
    };

    // Update status → transcribing
    update_file_status(&state, &file_id, FileStatus::Transcribing, None, None, None);
    let _ = app_handle.emit(
        "transcription-update",
        TranscriptionEvent {
            file_id: file_id.clone(),
            status: FileStatus::Transcribing,
            text: None,
            duration_ms: None,
            error: None,
        },
    );

    // Step 2: Read WAV as f32 samples
    let audio = read_wav_samples(&wav_path)?;

    // Clean up temp WAV if we created one
    if wav_path != input_path {
        std::fs::remove_file(&wav_path).ok();
    }

    // Step 3: Load model if needed
    state.transcription.load_model(&model_id, &model_path)?;

    // Step 4: Transcribe
    log::info!("Transcribing {} with model {}", filename, model_id);
    let result = state.transcription.transcribe(&audio, &language, false)?;

    // Update status → completed
    update_file_status(
        &state,
        &file_id,
        FileStatus::Completed,
        Some(result.text.clone()),
        Some(result.duration_ms),
        None,
    );
    let _ = app_handle.emit(
        "transcription-update",
        TranscriptionEvent {
            file_id,
            status: FileStatus::Completed,
            text: Some(result.text),
            duration_ms: Some(result.duration_ms),
            error: None,
        },
    );

    Ok(())
}

fn update_file_status(
    state: &State<AppState>,
    file_id: &str,
    status: FileStatus,
    result: Option<String>,
    duration_ms: Option<u64>,
    error: Option<String>,
) {
    if let Ok(mut queue) = state.queued_files.lock() {
        if let Some(file) = queue.iter_mut().find(|f| f.id == file_id) {
            file.status = status;
            if result.is_some() {
                file.result = result;
            }
            if duration_ms.is_some() {
                file.duration_ms = duration_ms;
            }
            if error.is_some() {
                file.error = error;
            }
        }
    }
}

/// Read a WAV file and return f32 samples (16kHz mono).
fn read_wav_samples(path: &Path) -> Result<Vec<f32>, String> {
    let reader =
        hound::WavReader::open(path).map_err(|e| format!("Ошибка чтения WAV: {e}"))?;

    let spec = reader.spec();
    log::info!(
        "WAV: {} Hz, {} ch, {:?}",
        spec.sample_rate,
        spec.channels,
        spec.sample_format
    );

    let samples: Vec<f32> = match spec.sample_format {
        hound::SampleFormat::Int => reader
            .into_samples::<i16>()
            .filter_map(|s| s.ok())
            .map(|s| s as f32 / i16::MAX as f32)
            .collect(),
        hound::SampleFormat::Float => reader
            .into_samples::<f32>()
            .filter_map(|s| s.ok())
            .collect(),
    };

    // If stereo, convert to mono by averaging channels
    if spec.channels == 2 {
        let mono: Vec<f32> = samples
            .chunks(2)
            .map(|chunk| {
                if chunk.len() == 2 {
                    (chunk[0] + chunk[1]) / 2.0
                } else {
                    chunk[0]
                }
            })
            .collect();
        Ok(mono)
    } else {
        Ok(samples)
    }
}

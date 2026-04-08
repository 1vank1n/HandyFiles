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
    let path = state.models.get_model_path_by_id(&model_id);
    if path.is_none() {
        return Err("Модель не скачана".into());
    }
    {
        let mut selected = state.selected_model.lock().unwrap();
        *selected = Some(model_id);
    }
    state.save_preferences();
    Ok(())
}

#[tauri::command]
pub fn get_selected_model(state: State<AppState>) -> Option<String> {
    state.selected_model.lock().unwrap().clone()
}

#[tauri::command]
pub fn set_language(language: String, state: State<AppState>) {
    {
        let mut lang = state.selected_language.lock().unwrap();
        *lang = language;
    }
    state.save_preferences();
}

#[tauri::command]
pub fn get_language(state: State<AppState>) -> String {
    state.selected_language.lock().unwrap().clone()
}

// ── FFmpeg commands ─────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct DecoderStatus {
    pub native_formats: Vec<String>,
    pub ffmpeg_available: bool,
    pub ffmpeg_path: Option<String>,
    pub ffmpeg_formats: Vec<String>,
}

#[tauri::command]
pub fn get_decoder_status(state: State<AppState>) -> DecoderStatus {
    DecoderStatus {
        native_formats: crate::managers::audio::NATIVE_EXTENSIONS
            .iter()
            .map(|s| s.to_string())
            .collect(),
        ffmpeg_available: state.ffmpeg.is_available(),
        ffmpeg_path: state.ffmpeg.binary_path().map(|p| p.display().to_string()),
        ffmpeg_formats: crate::managers::audio::FFMPEG_EXTENSIONS
            .iter()
            .map(|s| s.to_string())
            .collect(),
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

#[tauri::command]
pub fn reset_file_for_retranscribe(file_id: String, state: State<AppState>) -> Result<(), String> {
    let mut queue = state.queued_files.lock().unwrap();
    let file = queue
        .iter_mut()
        .find(|f| f.id == file_id)
        .ok_or("Файл не найден")?;
    file.status = FileStatus::Queued;
    file.result = None;
    file.duration_ms = None;
    file.error = None;
    Ok(())
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

#[derive(Clone, serde::Serialize)]
struct ProgressEvent {
    file_id: String,
    stage: String,
    progress: f64,
}

#[derive(Clone, serde::Serialize)]
struct LogEvent {
    file_id: String,
    message: String,
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

    // Get model path and engine type
    let model_path = state
        .models
        .get_model_path_by_id(&model_id)
        .ok_or("Модель не скачана")?;

    let engine_type = state
        .models
        .get_engine_type(&model_id)
        .ok_or("Тип движка не найден")?;

    let input_path = Path::new(&path);

    // Update status → converting/decoding
    update_file_status(&state, &file_id, FileStatus::Converting, None, None, None);
    emit_update(&app_handle, &file_id, FileStatus::Converting, None, None, None);

    // Progress helper
    let ah = app_handle.clone();
    let fid = file_id.clone();
    let emit_progress = move |stage: &str, pct: f64| {
        let _ = ah.emit("transcription-progress", ProgressEvent {
            file_id: fid.clone(),
            stage: stage.to_string(),
            progress: pct,
        });
    };

    let ah2 = app_handle.clone();
    let fid2 = file_id.clone();
    let emit_log = move |msg: String| {
        let _ = ah2.emit("transcription-log", LogEvent {
            file_id: fid2.clone(),
            message: msg,
        });
    };

    // Step 1: Decode audio to f32 samples at 16kHz mono
    let ext = input_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    emit_log(format!("Декодирование: {}", filename));

    let ep = emit_progress.clone();
    let audio = if crate::managers::audio::is_native_supported(&ext) {
        log::info!("Decoding {} natively (Symphonia)", filename);
        emit_log(format!("Декодер: Symphonia ({})", ext));
        let progress_fn: crate::managers::audio::ProgressFn = Box::new(move |stage, pct| {
            ep(stage, pct);
        });
        match crate::managers::audio::decode_to_samples_with_progress(input_path, Some(progress_fn)) {
            Ok(samples) => {
                emit_log(format!("Декодировано: {:.1}с аудио", samples.len() as f64 / 16000.0));
                samples
            }
            Err(e) => {
                emit_log(format!("Symphonia ошибка: {}, пробую FFmpeg", e));
                log::warn!("Native decode failed, trying FFmpeg: {e}");
                ffmpeg_fallback(&state, input_path, &filename)?
            }
        }
    } else {
        log::info!("Using FFmpeg for {} (unsupported by native decoder)", ext);
        emit_log(format!("Декодер: FFmpeg ({})", ext));
        ffmpeg_fallback(&state, input_path, &filename)?
    };

    // Update status → transcribing
    update_file_status(&state, &file_id, FileStatus::Transcribing, None, None, None);
    emit_update(&app_handle, &file_id, FileStatus::Transcribing, None, None, None);
    emit_progress("transcribing", 0.0);

    // Step 3: Load model if needed
    emit_log(format!("Загрузка модели: {}", model_id));
    state.transcription.load_model(&model_id, &model_path, &engine_type)?;
    emit_log("Модель загружена".to_string());

    // Step 4: Transcribe
    emit_log(format!("Транскрибация {:.1}с аудио...", audio.len() as f64 / 16000.0));
    log::info!("Transcribing {} with model {} ({:.1}s audio)", filename, model_id, audio.len() as f64 / 16000.0);
    let result = state.transcription.transcribe(&audio, &language, false)?;
    emit_progress("transcribing", 1.0);

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

fn emit_update(
    app_handle: &AppHandle,
    file_id: &str,
    status: FileStatus,
    text: Option<String>,
    duration_ms: Option<u64>,
    error: Option<String>,
) {
    let _ = app_handle.emit(
        "transcription-update",
        TranscriptionEvent {
            file_id: file_id.to_string(),
            status,
            text,
            duration_ms,
            error,
        },
    );
}

/// FFmpeg fallback for formats not supported by Symphonia.
fn ffmpeg_fallback(
    state: &State<AppState>,
    input_path: &Path,
    filename: &str,
) -> Result<Vec<f32>, String> {
    if !state.ffmpeg.is_available() {
        return Err(format!(
            "Формат {} не поддерживается нативно, а FFmpeg не найден. \
             Установите: brew install ffmpeg",
            input_path.extension().and_then(|e| e.to_str()).unwrap_or("?")
        ));
    }

    log::info!("Converting {} via FFmpeg (fallback)", filename);
    let wav_path = state.ffmpeg.extract_audio(input_path)?;
    let audio = transcribe_rs::audio::read_wav_samples(&wav_path)
        .map_err(|e| format!("Ошибка чтения WAV: {e}"))?;
    std::fs::remove_file(&wav_path).ok();
    Ok(audio)
}


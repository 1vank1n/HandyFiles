use std::path::Path;
use std::sync::Mutex;

use std::ffi::c_int;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

pub struct TranscriptionManager {
    context: Mutex<Option<LoadedModel>>,
}

struct LoadedModel {
    model_id: String,
    ctx: WhisperContext,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
}

impl TranscriptionManager {
    pub fn new() -> Self {
        Self {
            context: Mutex::new(None),
        }
    }

    /// Load a whisper model from disk. Unloads previous model if different.
    pub fn load_model(&self, model_id: &str, model_path: &Path) -> Result<(), String> {
        let mut ctx_guard = self.context.lock().unwrap();

        // Already loaded?
        if let Some(loaded) = ctx_guard.as_ref() {
            if loaded.model_id == model_id {
                return Ok(());
            }
        }

        log::info!("Loading model {} from {}", model_id, model_path.display());

        let params = WhisperContextParameters::default();
        let ctx = WhisperContext::new_with_params(
            model_path.to_str().ok_or("Invalid model path")?,
            params,
        )
        .map_err(|e| format!("Ошибка загрузки модели: {e}"))?;

        *ctx_guard = Some(LoadedModel {
            model_id: model_id.to_string(),
            ctx,
        });

        log::info!("Model {} loaded successfully", model_id);
        Ok(())
    }

    /// Unload the current model to free memory.
    pub fn unload_model(&self) {
        let mut ctx_guard = self.context.lock().unwrap();
        if let Some(loaded) = ctx_guard.take() {
            log::info!("Unloaded model {}", loaded.model_id);
        }
    }

    /// Transcribe audio samples (f32, 16kHz mono).
    pub fn transcribe(
        &self,
        audio: &[f32],
        language: &str,
        translate: bool,
    ) -> Result<TranscriptionResult, String> {
        let start = std::time::Instant::now();

        let ctx_guard = self.context.lock().unwrap();
        let loaded = ctx_guard
            .as_ref()
            .ok_or("Модель не загружена")?;

        let mut state = loaded
            .ctx
            .create_state()
            .map_err(|e| format!("Ошибка создания состояния: {e}"))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(language));
        params.set_translate(translate);
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_no_timestamps(true);

        // Run inference
        state
            .full(params, audio)
            .map_err(|e| format!("Ошибка транскрибации: {e}"))?;

        // Collect segments
        let num_segments = state.full_n_segments();
        let mut text = String::new();

        for i in 0..num_segments as c_int {
            if let Some(segment) = state.get_segment(i) {
                if let Ok(segment_text) = segment.to_str() {
                    text.push_str(segment_text);
                }
            }
        }

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(TranscriptionResult {
            text: text.trim().to_string(),
            duration_ms,
        })
    }

    pub fn is_loaded(&self) -> bool {
        self.context.lock().unwrap().is_some()
    }

    pub fn loaded_model_id(&self) -> Option<String> {
        self.context
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.model_id.clone())
    }
}

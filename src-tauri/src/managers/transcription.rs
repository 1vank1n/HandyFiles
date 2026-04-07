use std::path::Path;
use std::sync::Mutex;

use transcribe_rs::{SpeechModel, TranscribeOptions, TranscriptionResult as TrResult};

use crate::managers::model::EngineType;

pub struct TranscriptionManager {
    engine: Mutex<Option<LoadedEngine>>,
}

enum LoadedEngine {
    Whisper {
        model_id: String,
        engine: transcribe_rs::whisper_cpp::WhisperEngine,
    },
    GigaAM {
        model_id: String,
        engine: transcribe_rs::onnx::gigaam::GigaAMModel,
    },
}

impl LoadedEngine {
    fn model_id(&self) -> &str {
        match self {
            LoadedEngine::Whisper { model_id, .. } => model_id,
            LoadedEngine::GigaAM { model_id, .. } => model_id,
        }
    }

    fn transcribe(
        &mut self,
        audio: &[f32],
        options: &TranscribeOptions,
    ) -> Result<TrResult, String> {
        match self {
            LoadedEngine::Whisper { engine, .. } => engine
                .transcribe(audio, options)
                .map_err(|e| format!("Ошибка Whisper: {e}")),
            LoadedEngine::GigaAM { engine, .. } => engine
                .transcribe(audio, options)
                .map_err(|e| format!("Ошибка GigaAM: {e}")),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct TranscriptionResult {
    pub text: String,
    pub duration_ms: u64,
}

impl TranscriptionManager {
    pub fn new() -> Self {
        Self {
            engine: Mutex::new(None),
        }
    }

    /// Load a model. Unloads previous model if different.
    pub fn load_model(
        &self,
        model_id: &str,
        model_path: &Path,
        engine_type: &EngineType,
    ) -> Result<(), String> {
        let mut guard = self.engine.lock().unwrap();

        // Already loaded?
        if let Some(loaded) = guard.as_ref() {
            if loaded.model_id() == model_id {
                return Ok(());
            }
        }

        log::info!("Loading model {} from {}", model_id, model_path.display());

        let loaded = match engine_type {
            EngineType::Whisper => {
                let engine = transcribe_rs::whisper_cpp::WhisperEngine::load(model_path)
                    .map_err(|e| format!("Ошибка загрузки Whisper: {e}"))?;
                LoadedEngine::Whisper {
                    model_id: model_id.to_string(),
                    engine,
                }
            }
            EngineType::GigaAM => {
                let engine = transcribe_rs::onnx::gigaam::GigaAMModel::load(
                    model_path,
                    &transcribe_rs::onnx::Quantization::Int8,
                )
                .map_err(|e| format!("Ошибка загрузки GigaAM: {e}"))?;
                LoadedEngine::GigaAM {
                    model_id: model_id.to_string(),
                    engine,
                }
            }
        };

        *guard = Some(loaded);
        log::info!("Model {} loaded successfully", model_id);
        Ok(())
    }

    /// Unload the current model to free memory.
    pub fn unload_model(&self) {
        let mut guard = self.engine.lock().unwrap();
        if let Some(loaded) = guard.take() {
            log::info!("Unloaded model {}", loaded.model_id());
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

        let mut guard = self.engine.lock().unwrap();
        let loaded = guard.as_mut().ok_or("Модель не загружена")?;

        let options = TranscribeOptions {
            language: Some(language.to_string()),
            translate,
            ..Default::default()
        };

        let result = loaded.transcribe(audio, &options)?;

        let duration_ms = start.elapsed().as_millis() as u64;

        Ok(TranscriptionResult {
            text: result.text.trim().to_string(),
            duration_ms,
        })
    }

    pub fn is_loaded(&self) -> bool {
        self.engine.lock().unwrap().is_some()
    }

    pub fn loaded_model_id(&self) -> Option<String> {
        self.engine
            .lock()
            .unwrap()
            .as_ref()
            .map(|l| l.model_id().to_string())
    }
}

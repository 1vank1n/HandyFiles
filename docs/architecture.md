# HandyFiles — Architecture

## Overview

HandyFiles is a cross-platform desktop application for transcribing audio and video files using local AI models. Built with Tauri v2 (Rust + React), inspired by [Handy](https://github.com/cjpais/Handy).

## Core Data Flow

```
User drops file(s) onto DropZone
         │
         ▼
Frontend: onDragDropEvent → paths[] → invoke("queue_files", paths)
         │
         ▼
Rust: Validate files (extension, readable, has audio track)
         │
         ▼
For each file:
  ┌─ Audio (WAV 16kHz mono)? ──→ Use directly
  ├─ Audio (other format)?   ──→ FFmpeg → WAV 16kHz mono
  └─ Video (MP4/MKV/etc)?   ──→ FFmpeg extract audio → WAV 16kHz mono
         │
         ▼
  Load model if not loaded (lazy loading)
         │
         ▼
  transcribe-rs: engine.transcribe(&audio)
         │
         ▼
  Emit result event → Frontend displays text
         │
         ▼
  User: Copy to clipboard / Save as TXT / Save as SRT
```

## Backend (Rust) — Modules

### managers/model.rs (~1500 LOC, adapted from Handy)

Responsibilities:
- Maintain registry of available models (Whisper small/medium/large, GigaAM v3)
- Download models with HTTP resume support (`.partial` files)
- SHA256 verification after download
- Extract tar.gz archives (GigaAM) with atomic rename
- Track download progress, emit events to frontend
- Auto-discover user's existing `.bin` model files
- Store models in app data directory (`models/`)

Key types:
```rust
struct ModelInfo {
    id: String,
    name: String,
    description: String,
    engine_type: EngineType,    // Whisper | GigaAM
    filename: String,
    url: String,
    sha256: String,
    size_mb: u64,
    supported_languages: Vec<String>,
    is_downloaded: bool,
    is_downloading: bool,
    download_progress: f64,
}

enum EngineType { Whisper, GigaAM }
```

### managers/transcription.rs (~600 LOC, simplified from Handy)

Responsibilities:
- Load/unload transcription engine (transcribe-rs)
- Lazy loading: load model on first transcription request
- Auto-unload after idle timeout (configurable, default 10 min)
- Execute transcription with panic recovery (`catch_unwind`)
- Emit progress events for long files
- Support language selection and translate-to-English option

### managers/ffmpeg.rs (~300 LOC, new)

Responsibilities:
- Locate FFmpeg binary (bundled → system PATH → error)
- Probe input files (`ffprobe` for duration, codecs, streams)
- Extract/convert audio to WAV 16kHz mono via child process
- Parse stderr for progress, emit events to frontend
- Support cancellation via `child.kill()`
- Clean up temporary WAV files after transcription

### commands/ (Tauri command handlers)

Frontend-facing API:
```rust
// Models
fn get_available_models() -> Vec<ModelInfo>
fn download_model(model_id: String) -> Result<()>
fn cancel_download(model_id: String) -> Result<()>
fn delete_model(model_id: String) -> Result<()>
fn select_model(model_id: String) -> Result<()>

// Transcription
fn queue_files(paths: Vec<String>) -> Result<Vec<QueuedFile>>
fn transcribe_file(file_id: String) -> Result<()>
fn cancel_transcription(file_id: String) -> Result<()>
fn save_transcription(file_id: String, output_path: String) -> Result<()>

// Settings
fn get_settings() -> Settings
fn update_settings(settings: Settings) -> Result<()>

// System
fn get_ffmpeg_status() -> FfmpegStatus
fn open_models_directory() -> Result<()>
```

### settings.rs (~150 LOC)

```rust
struct Settings {
    selected_model: String,
    selected_language: String,        // default: "ru"
    translate_to_english: bool,       // default: false
    model_unload_timeout_minutes: u32, // default: 10
    output_directory: Option<String>, // default: Downloads
    auto_save: bool,                  // default: false
}
```

## Frontend (React) — Components

### DropZone.tsx (core UX)
- Full-width drop area with visual feedback (idle / drag-over / processing)
- Uses `@tauri-apps/api/webview` `onDragDropEvent` for native drag-and-drop
- Click-to-browse via `@tauri-apps/plugin-dialog` `open()`
- Accepts: mp4, mkv, mov, avi, webm, mp3, wav, flac, ogg, m4a, aac, wma

### FileQueue.tsx + FileItem.tsx
- File states: queued → converting → transcribing → completed / error
- Progress bars for FFmpeg conversion and transcription
- Per-file: cancel, copy, save buttons
- Click file to view transcription result

### TranscriptionResult.tsx
- Displays selected file's transcription text
- Copy to clipboard, save as TXT, save as SRT
- Metadata: file name, duration, model used, processing time

### model-selector/ (adapted from Handy)
- Dropdown to select active model
- Download progress with percentage and speed
- Model info: size, supported languages, engine type

### settings/ 
- Modal panel with: model management, language, output directory, auto-save

## Frontend Stores (Zustand)

### modelStore.ts (adapted from Handy)
- `models: ModelInfo[]` — available models with download status
- `selectedModelId: string`
- `downloadModel(id)`, `cancelDownload(id)`, `deleteModel(id)`
- Listens to Tauri events: `model-download-progress`, `model-download-complete`

### transcriptionStore.ts (new)
- `files: QueuedFile[]` — file queue with status and results
- `selectedFileId: string | null`
- `addFiles(paths)`, `startTranscription(id)`, `cancelTranscription(id)`
- `saveTranscription(id, path)`, `copyTranscription(id)`
- Listens to events: `ffmpeg-progress`, `transcription-progress`, `transcription-complete`

### settingsStore.ts
- Wraps `tauri-plugin-store` for persistent settings
- Syncs with Rust backend on changes

## Supported Models

| Model | Engine | Size | Languages | Notes |
|-------|--------|------|-----------|-------|
| Whisper Small | whisper-cpp | ~500MB | 99 languages | Fast, good quality |
| Whisper Medium | whisper-cpp | ~1.5GB | 99 languages | Better quality |
| Whisper Large v3 | whisper-cpp | ~3GB | 99 languages | Best Whisper quality |
| GigaAM v3 | ONNX | ~500MB | Russian | Specialized for Russian |

## Tauri Events (Backend → Frontend)

```
model-download-progress   { model_id, progress: 0.0..1.0, speed_bps }
model-download-complete   { model_id }
model-download-error      { model_id, error }
model-loading             { model_id }
model-loaded              { model_id }
model-unloaded            { model_id }
ffmpeg-progress           { file_id, progress: 0.0..1.0 }
transcription-progress    { file_id, progress: 0.0..1.0 }
transcription-complete    { file_id, text, duration_ms }
transcription-error       { file_id, error }
```

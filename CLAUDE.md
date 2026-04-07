# HandyFiles

Cross-platform desktop app for drag-and-drop audio/video transcription using local AI models.

## Tech Stack

- **Desktop framework:** Tauri v2 (Rust backend + webview frontend)
- **Frontend:** React 18 + TypeScript + Tailwind CSS 4 + Vite
- **State management:** Zustand
- **Backend:** Rust (tokio, serde, transcribe-rs)
- **Audio processing:** FFmpeg (bundled binary + system fallback) + hound (WAV)
- **Type bindings:** tauri-specta (auto-generated TS types from Rust)
- **Package manager:** pnpm

## Project Structure

```
HandyFiles/
├── src/                          # React/TypeScript frontend
│   ├── App.tsx                   # Main layout
│   ├── main.tsx                  # Entry point
│   ├── components/               # UI components
│   │   ├── DropZone.tsx          # Drag-and-drop area (core UX)
│   │   ├── FileQueue.tsx         # Queued/processing files list
│   │   ├── FileItem.tsx          # Single file row with status
│   │   ├── TranscriptionResult.tsx
│   │   ├── model-selector/       # Model download/select UI
│   │   └── settings/             # Settings panel
│   ├── stores/                   # Zustand stores
│   │   ├── modelStore.ts
│   │   ├── transcriptionStore.ts
│   │   └── settingsStore.ts
│   └── lib/                      # Utilities, Tauri bindings
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Tauri setup, plugin/command registration
│   │   ├── main.rs               # Entry point
│   │   ├── managers/
│   │   │   ├── model.rs          # Model download/storage/selection
│   │   │   ├── transcription.rs  # Transcription engine orchestration
│   │   │   └── ffmpeg.rs         # FFmpeg binary detection & audio extraction
│   │   ├── commands/             # Tauri command handlers (frontend API)
│   │   └── settings.rs           # App settings persistence
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── resources/                # Bundled binaries (FFmpeg)
├── docs/                         # Architecture docs & plans
└── package.json
```

## Architecture Decisions

- **Not a fork of Handy** — different UX paradigm (file transcription vs microphone recording). Handy used as reference for model management (~80% adapted).
- **FFmpeg strategy:** Bundled static binary in production (Tauri resources), system ffmpeg as fallback. MVP uses system ffmpeg only.
- **Models:** Whisper (small/medium/large) + GigaAM v3 (Russian-specialized). Model registry adapted from Handy.
- **Transcription engine:** `transcribe-rs` crate (same as Handy) — supports whisper-cpp with Metal/Vulkan/DirectML acceleration.

## Conventions

- Rust: standard `cargo fmt` + `clippy`
- TypeScript: ESLint + Prettier
- Commits: conventional commits in English
- UI text: Russian (primary user language)
- Default transcription language: Russian (ru)

## Commands

```bash
# Development
pnpm install              # Install frontend dependencies
pnpm tauri dev            # Run in dev mode (frontend + Rust backend)
pnpm tauri build          # Build production app

# Rust
cd src-tauri && cargo check    # Type-check Rust code
cd src-tauri && cargo clippy   # Lint Rust code
cd src-tauri && cargo test     # Run Rust tests

# Frontend
pnpm dev                  # Frontend only (without Tauri)
pnpm build                # Build frontend only
```

## Reference

- **Handy app:** https://github.com/cjpais/Handy (MIT license, model management reference)
- **transcribe-rs:** Core transcription crate used by Handy
- **Tauri v2 docs:** https://v2.tauri.app

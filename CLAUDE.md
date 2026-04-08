# HandyFiles

Cross-platform desktop app for drag-and-drop audio/video transcription using local AI models.

## Tech Stack

- **Desktop framework:** Tauri v2 (Rust backend + webview frontend)
- **Frontend:** React 18 + TypeScript + Tailwind CSS 4 + Vite
- **State management:** Zustand
- **Backend:** Rust (tokio, serde, transcribe-rs)
- **Audio decoding:** Symphonia (pure Rust, no system deps) + Rubato (resampling to 16kHz)
- **FFmpeg:** Optional fallback for AVI/MOV/WMA only (not required for most formats)
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
│   │   ├── ModelSelector.tsx     # Model download/select UI
│   │   ├── SettingsPanel.tsx     # Language, decoder status
│   │   └── TranscriptionResult.tsx
│   ├── stores/                   # Zustand stores
│   │   ├── modelStore.ts
│   │   └── transcriptionStore.ts
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── lib.rs                # Tauri setup, plugin/command registration
│   │   ├── main.rs               # Entry point
│   │   ├── managers/
│   │   │   ├── audio.rs          # Native audio decoding (Symphonia + Rubato)
│   │   │   ├── model.rs          # Model download/storage/selection
│   │   │   ├── transcription.rs  # Transcription engine orchestration
│   │   │   └── ffmpeg.rs         # FFmpeg fallback (AVI/MOV only)
│   │   ├── commands/             # Tauri command handlers (frontend API)
│   │   └── settings.rs           # App settings (unused, prefs in managers/mod.rs)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   └── resources/                # Bundled binaries (FFmpeg)
├── docs/                         # Architecture docs & plans
└── package.json
```

## Architecture Decisions

- **Not a fork of Handy** — different UX paradigm (file transcription vs microphone recording). Handy used as reference for model management (~80% adapted).
- **Audio decoding:** Symphonia (pure Rust) as primary decoder for MP3/WAV/FLAC/OGG/AAC/M4A/MP4/MKV/WebM. FFmpeg as optional fallback for AVI/MOV/WMA — no external dependencies required for most users.
- **Models:** Whisper (tiny/base/small/medium/large-v3/large-v3-turbo) + GigaAM v3 (Russian-specialized). Model registry adapted from Handy.
- **Transcription engine:** `transcribe-rs` crate (same as Handy) — Whisper (whisper-cpp + Metal on macOS) and GigaAM (ONNX).
- **Preferences:** Saved to `preferences.json` in app data dir (selected model, language). Restored on launch.

## Conventions

- Rust: standard `cargo fmt` + `clippy`
- TypeScript: ESLint + Prettier
- Commits: conventional commits in English
- UI text: Russian (primary user language)
- Default transcription language: Russian (ru)
- Git workflow: PR into main, avoid direct pushes (hotfix exceptions only)

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

## Gotchas

- `cargo tauri` is not bundled with Rust — install separately: `cargo install tauri-cli --version "^2"`
- Cargo merges features from all `[dependencies]` sections. Don't duplicate a crate in `[dependencies]` and `[target.*.dependencies]` with different features — they'll all be enabled everywhere. Only add platform-specific _extra_ features in target sections.
- `ort-sys` (ONNX Runtime) has no prebuilt binaries for `x86_64-apple-darwin` — GigaAM works only on ARM64 macOS. Intel Macs can use Whisper models only.
- ONNX Runtime prebuilt binaries require glibc 2.38+ — use ubuntu-24.04 in CI, not 22.04.
- macOS Gatekeeper blocks unsigned apps ("is damaged" error). Fix: `xattr -cr /Applications/HandyFiles.app`
- Symphonia does not support AVI or MOV containers — those fall back to FFmpeg.

## Tech Debt & TODOs

- macOS x64 (Intel) CI build disabled — no ONNX prebuilt for x86_64-apple-darwin
- Apple codesigning + notarization not configured (requires $99/year Developer account)
- `settings.rs` is unused — preferences are handled in `managers/mod.rs`

## Reference

- **Handy app:** https://github.com/cjpais/Handy (MIT license, model management reference)
- **transcribe-rs:** Core transcription crate used by Handy
- **Tauri v2 docs:** https://v2.tauri.app

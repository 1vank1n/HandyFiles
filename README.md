# HandyFiles

Cross-platform desktop app for transcribing audio and video files using local AI models. No cloud, no API keys — everything runs on your machine.

> Inspired by [Handy](https://github.com/cjpais/Handy) — a great open-source speech-to-text app. HandyFiles borrows its model management approach, uses the same [transcribe-rs](https://github.com/cjpais/transcribe-rs) engine, and shares the GigaAM model distribution. While Handy focuses on live microphone recording, HandyFiles is designed for file-based transcription with drag & drop.

## Features

- **Drag & drop** any audio or video file
- **Local transcription** using Whisper and GigaAM models
- **Model management** — download, switch, and compare models from the app
- **Native audio decoding** — no FFmpeg required (Symphonia + Rubato)
- **Re-transcribe** with a different model to compare results
- Supports: MP3, WAV, FLAC, OGG, AAC, M4A, MP4, MKV, WebM

## Supported Models

| Model | Size | Languages | Notes |
|-------|------|-----------|-------|
| Whisper Tiny | 75 MB | 99 languages | Fastest |
| Whisper Base | 142 MB | 99 languages | Good balance |
| Whisper Small | 466 MB | 99 languages | Recommended |
| Whisper Medium | 1.5 GB | 99 languages | High quality |
| Whisper Large v3 | 3 GB | 99 languages | Best quality |
| Whisper Large v3 Turbo | 1.6 GB | 99 languages | Large quality, medium speed |
| GigaAM v3 | 151 MB | Russian | Specialized for Russian |

## Install

Download the latest release for your platform from [Releases](../../releases).

- **macOS**: `.dmg` (Apple Silicon & Intel)
- **Windows**: `.exe` (NSIS installer)
- **Linux**: `.deb` or `.AppImage`

## Build from Source

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 10+

**Linux only:**
```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### Build

```bash
pnpm install
pnpm tauri build
```

### Development

```bash
pnpm tauri dev
```

## Tech Stack

- **Tauri v2** — Rust backend + webview frontend
- **React 18** + TypeScript + Tailwind CSS 4
- **transcribe-rs** — Whisper (whisper-cpp) + GigaAM (ONNX) transcription
- **Symphonia** — pure Rust audio/video decoding
- **Rubato** — audio resampling to 16kHz

## License

MIT

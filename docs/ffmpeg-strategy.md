# FFmpeg Strategy

## Problem

HandyFiles needs FFmpeg to convert video/audio files to WAV 16kHz mono for transcription.
Users may not have FFmpeg installed. The app must work out of the box.

## Solution: Bundled Binary + System Fallback

### Priority order (runtime resolution)

1. **Bundled binary** — shipped inside the app bundle via Tauri resources
2. **System PATH** — `which ffmpeg` / common paths (`/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`)
3. **Error with install instructions** — guide user to install FFmpeg

### MVP (Phase 3-4): System FFmpeg Only

For the initial macOS MVP, we detect system ffmpeg:

```rust
fn find_ffmpeg() -> Result<PathBuf> {
    // 1. Check bundled (future)
    // if let Ok(path) = app.path().resolve("resources/ffmpeg/ffmpeg", BaseDirectory::Resource) {
    //     if path.is_file() { return Ok(path); }
    // }

    // 2. Check common macOS paths
    for path in ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/usr/bin/ffmpeg"] {
        if Path::new(path).is_file() {
            return Ok(PathBuf::from(path));
        }
    }

    // 3. Check PATH
    if let Ok(output) = Command::new("which").arg("ffmpeg").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Ok(PathBuf::from(path));
        }
    }

    Err(anyhow!("FFmpeg not found. Install via: brew install ffmpeg"))
}
```

The frontend shows a clear status indicator:
- Green checkmark: FFmpeg found at `/opt/homebrew/bin/ffmpeg`
- Red warning: FFmpeg not found + install button opening terminal with `brew install ffmpeg`

### Production (Phase 5+): Bundled Static Binary

#### Binary sources by platform

| Platform | Source | Size | Notes |
|----------|--------|------|-------|
| macOS ARM64 | [evermeet.cx/ffmpeg](https://evermeet.cx/ffmpeg/) | ~70MB | Static build, well-maintained |
| macOS x86_64 | evermeet.cx/ffmpeg | ~70MB | Intel Macs |
| Windows x64 | [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds) | ~80MB | GPL static build |
| Linux x64 | BtbN/FFmpeg-Builds | ~75MB | GPL static build |

#### Tauri resource bundling

In `tauri.conf.json`:
```json
{
  "bundle": {
    "resources": {
      "resources/ffmpeg/ffmpeg-aarch64-darwin": "ffmpeg",
      "resources/ffmpeg/ffmpeg.exe": "ffmpeg.exe"
    }
  }
}
```

#### CI/CD binary download (GitHub Actions)

```yaml
- name: Download FFmpeg (macOS ARM64)
  if: matrix.os == 'macos-latest'
  run: |
    curl -L -o ffmpeg.7z "https://evermeet.cx/ffmpeg/getrelease/ffmpeg/7z"
    7z x ffmpeg.7z -o src-tauri/resources/ffmpeg/
    chmod +x src-tauri/resources/ffmpeg/ffmpeg
```

#### Runtime resolution (production)

```rust
fn find_ffmpeg(app: &AppHandle) -> Result<PathBuf> {
    // 1. Bundled binary (Tauri resource)
    if let Ok(resource_dir) = app.path().resource_dir() {
        let bundled = resource_dir.join("ffmpeg");
        if bundled.is_file() && is_executable(&bundled) {
            return Ok(bundled);
        }
    }

    // 2. System fallback
    find_system_ffmpeg()
}
```

### Size optimization

Full FFmpeg static build is ~70-80MB. To reduce:

1. **Custom build** with only needed codecs: `--disable-all --enable-demuxer=mov,matroska,mp3,flac,ogg,wav,aac --enable-decoder=... --enable-encoder=pcm_s16le --enable-muxer=wav --enable-filter=aresample`
   - Estimated size: ~15-20MB
2. **Compress with UPX**: further ~40% reduction
3. **Download on first launch** instead of bundling (like models) — keeps installer small

Recommended: start with full static build (~70MB), optimize later if app size is a concern.

### FFmpeg command used

```bash
ffmpeg -y -i <input> \
  -vn \                    # No video
  -ar 16000 \              # 16kHz sample rate (whisper requirement)
  -ac 1 \                  # Mono
  -c:a pcm_s16le \         # 16-bit PCM WAV
  -f wav \                 # Force WAV output
  <output.wav>
```

### Progress parsing

FFmpeg outputs progress to stderr in this format:
```
frame=    0 fps=0.0 q=-1.0 size=   16384kB time=00:05:23.45 bitrate= 414.5kbits/s speed=12.3x
```

We parse `time=HH:MM:SS.ms` and compare with total duration (from `ffprobe`) to calculate progress percentage.

### Temporary file management

```
/tmp/handyfiles_<uuid>.wav    # Created by FFmpeg
                               # Deleted after transcription completes or fails
                               # Cleanup on app exit for any remaining temp files
```

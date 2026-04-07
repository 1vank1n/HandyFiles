use std::path::{Path, PathBuf};
use std::process::Command;

/// Manages FFmpeg binary detection and audio extraction.
///
/// MVP: detects system-installed FFmpeg.
/// Production: will also check for bundled binary in Tauri resources.
pub struct FfmpegManager {
    path: Option<PathBuf>,
}

impl FfmpegManager {
    pub fn new() -> Self {
        let path = Self::find_ffmpeg();
        Self { path }
    }

    pub fn binary_path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub fn is_available(&self) -> bool {
        self.path.is_some()
    }

    /// Extract audio from a media file to WAV 16kHz mono.
    /// Returns the path to the temporary WAV file.
    pub fn extract_audio(&self, input: &Path) -> Result<PathBuf, String> {
        let ffmpeg = self.path.as_ref().ok_or_else(|| {
            "FFmpeg не найден. Установите: brew install ffmpeg".to_string()
        })?;

        let output = std::env::temp_dir().join(format!(
            "handyfiles_{}.wav",
            uuid::Uuid::new_v4()
        ));

        let status = Command::new(ffmpeg)
            .args([
                "-y",
                "-i",
                input.to_str().unwrap_or_default(),
                "-vn",
                "-ar",
                "16000",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                "-f",
                "wav",
                output.to_str().unwrap_or_default(),
            ])
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .status()
            .map_err(|e| format!("Ошибка запуска FFmpeg: {e}"))?;

        if !status.success() {
            return Err(format!("FFmpeg завершился с кодом {}", status.code().unwrap_or(-1)));
        }

        if !output.exists() {
            return Err("FFmpeg не создал выходной файл".to_string());
        }

        Ok(output)
    }

    fn find_ffmpeg() -> Option<PathBuf> {
        // 1. Common macOS Homebrew paths
        let common_paths = [
            "/opt/homebrew/bin/ffmpeg",
            "/usr/local/bin/ffmpeg",
            "/usr/bin/ffmpeg",
        ];

        for path in &common_paths {
            let p = Path::new(path);
            if p.is_file() {
                return Some(p.to_path_buf());
            }
        }

        // 2. Check PATH via `which`
        if let Ok(output) = Command::new("which").arg("ffmpeg").output() {
            if output.status.success() {
                let path_str = String::from_utf8_lossy(&output.stdout)
                    .trim()
                    .to_string();
                if !path_str.is_empty() {
                    let p = PathBuf::from(&path_str);
                    if p.is_file() {
                        return Some(p);
                    }
                }
            }
        }

        None
    }
}

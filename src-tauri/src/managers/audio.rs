//! Native audio decoder using Symphonia + Rubato.
//! Decodes audio/video files to f32 samples at 16kHz mono.
//! No system dependencies — pure Rust.

use std::path::Path;

use symphonia::core::audio::SampleBuffer;
use symphonia::core::codecs::DecoderOptions;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;

use rubato::{SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction};

const TARGET_SAMPLE_RATE: u32 = 16_000;

/// Supported extensions for the native decoder (Symphonia).
pub const NATIVE_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "flac", "ogg", "m4a", "aac", // audio
    "mp4", "mkv", "webm", // video containers (audio track extraction)
];

/// Extensions that require FFmpeg fallback.
pub const FFMPEG_EXTENSIONS: &[&str] = &["avi", "mov", "wma"];

/// Check if a file extension is natively supported.
pub fn is_native_supported(ext: &str) -> bool {
    NATIVE_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

/// Progress callback: (stage, progress 0.0..1.0)
pub type ProgressFn = Box<dyn Fn(&str, f64) + Send>;

/// Decode an audio/video file to f32 samples at 16kHz mono.
pub fn decode_to_samples(path: &Path) -> Result<Vec<f32>, String> {
    decode_to_samples_with_progress(path, None)
}

/// Decode with optional progress callback.
pub fn decode_to_samples_with_progress(
    path: &Path,
    progress: Option<ProgressFn>,
) -> Result<Vec<f32>, String> {
    let report = |stage: &str, pct: f64| {
        if let Some(ref cb) = progress {
            cb(stage, pct);
        }
    };

    report("decoding", 0.0);

    let file = std::fs::File::open(path)
        .map_err(|e| format!("Ошибка открытия файла: {e}"))?;
    let file_size = file.metadata().map(|m| m.len()).unwrap_or(0);

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Формат не поддерживается: {e}"))?;

    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != symphonia::core::codecs::CODEC_TYPE_NULL)
        .ok_or("Аудио дорожка не найдена")?;

    let track_id = track.id;
    let codec_params = track.codec_params.clone();

    let source_sample_rate = codec_params.sample_rate
        .ok_or("Частота дискретизации не определена")?;
    let source_channels = codec_params.channels
        .map(|c| c.count())
        .unwrap_or(1);

    // Estimate total samples for progress
    let estimated_duration = codec_params.n_frames
        .map(|f| f as f64 / source_sample_rate as f64)
        .unwrap_or_else(|| {
            // Rough estimate from file size (assume ~128kbps)
            if file_size > 0 { file_size as f64 / 16000.0 } else { 0.0 }
        });

    log::info!(
        "Audio: {} Hz, {} ch, ~{:.0}s",
        source_sample_rate, source_channels, estimated_duration
    );

    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Кодек не поддерживается: {e}"))?;

    let mut all_samples: Vec<f32> = Vec::new();
    let mut decoded_frames: u64 = 0;
    let total_frames_est = (estimated_duration * source_sample_rate as f64) as u64;

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(_) => continue,
        };

        let spec = *decoded.spec();
        let num_frames = decoded.frames();
        if num_frames == 0 {
            continue;
        }

        decoded_frames += num_frames as u64;

        let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
        sample_buf.copy_interleaved_ref(decoded);
        let samples = sample_buf.samples();

        if spec.channels.count() > 1 {
            let ch = spec.channels.count();
            for frame in samples.chunks(ch) {
                let mono: f32 = frame.iter().sum::<f32>() / ch as f32;
                all_samples.push(mono);
            }
        } else {
            all_samples.extend_from_slice(samples);
        }

        // Report progress every ~1s of audio
        if total_frames_est > 0 && decoded_frames % (source_sample_rate as u64) < num_frames as u64 {
            let pct = (decoded_frames as f64 / total_frames_est as f64).min(0.99);
            report("decoding", pct);
        }
    }

    report("decoding", 1.0);

    if all_samples.is_empty() {
        return Err("Файл не содержит аудио данных".to_string());
    }

    // Resample to 16kHz if needed
    if source_sample_rate != TARGET_SAMPLE_RATE {
        log::info!(
            "Resampling {} Hz → {} Hz ({} samples)",
            source_sample_rate, TARGET_SAMPLE_RATE, all_samples.len()
        );
        report("resampling", 0.0);
        all_samples = resample(&all_samples, source_sample_rate, TARGET_SAMPLE_RATE, &|pct| {
            report("resampling", pct);
        })?;
        report("resampling", 1.0);
    }

    log::info!(
        "Decoded: {} samples ({:.1}s at 16kHz)",
        all_samples.len(),
        all_samples.len() as f64 / TARGET_SAMPLE_RATE as f64
    );

    Ok(all_samples)
}

/// Resample audio from source rate to target rate using Rubato.
fn resample(
    samples: &[f32],
    source_rate: u32,
    target_rate: u32,
    progress: &dyn Fn(f64),
) -> Result<Vec<f32>, String> {
    use rubato::Resampler;

    let params = SincInterpolationParameters {
        sinc_len: 64,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 128,
        window: WindowFunction::BlackmanHarris2,
    };

    let ratio = target_rate as f64 / source_rate as f64;
    let chunk_size = 4096;

    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0,
        params,
        chunk_size,
        1,
    )
    .map_err(|e| format!("Ошибка инициализации ресемплера: {e}"))?;

    let input_chunk_size = resampler.input_frames_max();
    let mut output = Vec::with_capacity((samples.len() as f64 * ratio * 1.1) as usize);
    let total = samples.len();

    let mut pos = 0;
    while pos < total {
        let end = (pos + input_chunk_size).min(total);
        let chunk = &samples[pos..end];
        let input = vec![chunk.to_vec()];

        let result = if end == total {
            resampler.process_partial(Some(&input), None)
        } else {
            resampler.process(&input, None)
        };

        match result {
            Ok(resampled) => {
                if let Some(channel) = resampled.first() {
                    output.extend_from_slice(channel);
                }
            }
            Err(e) => {
                log::warn!("Resample error: {e}");
                break;
            }
        }

        pos = end;
        progress(pos as f64 / total as f64);
    }

    Ok(output)
}

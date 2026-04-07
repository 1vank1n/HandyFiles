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

/// Decode an audio/video file to f32 samples at 16kHz mono.
/// Returns the samples ready for transcription.
pub fn decode_to_samples(path: &Path) -> Result<Vec<f32>, String> {
    let file = std::fs::File::open(path)
        .map_err(|e| format!("Ошибка открытия файла: {e}"))?;

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    // Provide a hint based on file extension
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    // Probe the format
    let probed = symphonia::default::get_probe()
        .format(
            &hint,
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("Формат не поддерживается: {e}"))?;

    let mut format = probed.format;

    // Find the first audio track
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

    log::info!(
        "Audio: {} Hz, {} ch, codec {:?}",
        source_sample_rate,
        source_channels,
        codec_params.codec
    );

    // Create decoder
    let mut decoder = symphonia::default::get_codecs()
        .make(&codec_params, &DecoderOptions::default())
        .map_err(|e| format!("Кодек не поддерживается: {e}"))?;

    // Decode all packets
    let mut all_samples: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(p) => p,
            Err(symphonia::core::errors::Error::IoError(ref e))
                if e.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break; // End of stream
            }
            Err(e) => {
                log::warn!("Packet error: {e}");
                break;
            }
        };

        // Skip packets from other tracks
        if packet.track_id() != track_id {
            continue;
        }

        let decoded = match decoder.decode(&packet) {
            Ok(d) => d,
            Err(e) => {
                log::warn!("Decode error: {e}");
                continue;
            }
        };

        let spec = *decoded.spec();
        let num_frames = decoded.frames();

        if num_frames == 0 {
            continue;
        }

        let mut sample_buf = SampleBuffer::<f32>::new(num_frames as u64, spec);
        sample_buf.copy_interleaved_ref(decoded);

        let samples = sample_buf.samples();

        // Convert to mono if multi-channel
        if spec.channels.count() > 1 {
            let ch = spec.channels.count();
            for frame in samples.chunks(ch) {
                let mono: f32 = frame.iter().sum::<f32>() / ch as f32;
                all_samples.push(mono);
            }
        } else {
            all_samples.extend_from_slice(samples);
        }
    }

    if all_samples.is_empty() {
        return Err("Файл не содержит аудио данных".to_string());
    }

    // Resample to 16kHz if needed
    if source_sample_rate != TARGET_SAMPLE_RATE {
        log::info!(
            "Resampling {} Hz → {} Hz ({} samples)",
            source_sample_rate,
            TARGET_SAMPLE_RATE,
            all_samples.len()
        );
        all_samples = resample(&all_samples, source_sample_rate, TARGET_SAMPLE_RATE)?;
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
) -> Result<Vec<f32>, String> {
    use rubato::Resampler;

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };

    let ratio = target_rate as f64 / source_rate as f64;

    let mut resampler = SincFixedIn::<f32>::new(
        ratio,
        2.0, // max relative ratio
        params,
        samples.len().min(1024), // chunk size
        1, // mono
    )
    .map_err(|e| format!("Ошибка инициализации ресемплера: {e}"))?;

    // Process in chunks
    let chunk_size = resampler.input_frames_max();
    let mut output = Vec::with_capacity((samples.len() as f64 * ratio * 1.1) as usize);

    let mut pos = 0;
    while pos < samples.len() {
        let end = (pos + chunk_size).min(samples.len());
        let chunk = &samples[pos..end];

        // Rubato expects Vec<Vec<f32>> (channels x samples)
        let input = vec![chunk.to_vec()];

        let result = if end == samples.len() {
            // Last chunk — process remaining
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
                log::warn!("Resample chunk error: {e}");
                break;
            }
        }

        pos = end;
    }

    Ok(output)
}

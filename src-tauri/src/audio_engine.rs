//! Native microphone audio capture engine using cpal (WASAPI) and hound (WAV).

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Holds state for an active recording session.
struct ActiveSession {
    _stream: cpal::Stream,
    samples: Arc<Mutex<Vec<i16>>>,
    sample_rate: u32,
}

static CURRENT_SESSION: Mutex<Option<ActiveSession>> = Mutex::new(None);

/// Starts recording audio from the system default input device.
pub fn start_recording() -> Result<(), String> {
    let mut session_lock = CURRENT_SESSION
        .lock()
        .map_err(|e| format!("Failed to acquire audio session lock: {}", e))?;

    if session_lock.is_some() {
        return Err("Audio recording is already in progress".to_string());
    }

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No default audio input device found on system".to_string())?;

    let default_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to query input device configuration: {}", e))?;

    let sample_rate = default_config.sample_rate();
    let channels = default_config.channels() as usize;
    let sample_format = default_config.sample_format();

    let samples_buf = Arc::new(Mutex::new(Vec::<i16>::with_capacity(sample_rate as usize * 10)));
    let buf_clone = Arc::clone(&samples_buf);

    let err_fn = |err| eprintln!("Audio capture stream error: {}", err);
    let stream_config: cpal::StreamConfig = default_config.into();

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let buffer = buf_clone;
            device
                .build_input_stream(
                    stream_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut lock) = buffer.lock() {
                            for chunk in data.chunks(channels) {
                                let sum: f32 = chunk.iter().copied().sum();
                                let avg = sum / (channels as f32);
                                let pcm = (avg * 32767.0).clamp(-32768.0, 32767.0) as i16;
                                lock.push(pcm);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build F32 input stream: {}", e))?
        }
        cpal::SampleFormat::I16 => {
            let buffer = buf_clone;
            device
                .build_input_stream(
                    stream_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        if let Ok(mut lock) = buffer.lock() {
                            for chunk in data.chunks(channels) {
                                let sum: i32 = chunk.iter().map(|&s| s as i32).sum();
                                let avg = (sum / (channels as i32)) as i16;
                                lock.push(avg);
                            }
                        }
                    },
                    err_fn,
                    None,
                )
                .map_err(|e| format!("Failed to build I16 input stream: {}", e))?
        }
        format => {
            return Err(format!(
                "Unsupported audio sample format: {:?}",
                format
            ));
        }
    };

    stream
        .play()
        .map_err(|e| format!("Failed to activate audio input stream: {}", e))?;

    *session_lock = Some(ActiveSession {
        _stream: stream,
        samples: samples_buf,
        sample_rate,
    });

    Ok(())
}

/// Stops recording, writes captured samples to a WAV file in the temporary directory,
/// and returns the absolute path to the saved file.
pub fn stop_recording() -> Result<String, String> {
    let mut session_lock = CURRENT_SESSION
        .lock()
        .map_err(|e| format!("Failed to acquire audio session lock: {}", e))?;

    let session = session_lock
        .take()
        .ok_or_else(|| "No active recording session to stop".to_string())?;

    // Session stream drops here, closing the audio device handle immediately.
    let samples = session
        .samples
        .lock()
        .map_err(|e| format!("Failed to lock sample buffer: {}", e))?
        .clone();

    let output_dir = std::env::temp_dir().join("potatoclaw_audio");
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create audio output directory: {}", e))?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let file_path: PathBuf = output_dir.join(format!("voice_{}.wav", timestamp));

    write_wav_file(&file_path, session.sample_rate, &samples)?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Helper to write 16-bit PCM mono samples into a WAV file using hound.
pub fn write_wav_file(path: &Path, sample_rate: u32, samples: &[i16]) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut writer = hound::WavWriter::create(path, spec)
        .map_err(|e| format!("Failed to create WAV writer at {:?}: {}", path, e))?;

    for sample in samples {
        writer
            .write_sample(*sample)
            .map_err(|e| format!("Failed to write audio sample: {}", e))?;
    }

    writer
        .finalize()
        .map_err(|e| format!("Failed to finalize WAV file: {}", e))?;

    Ok(())
}

/// Generates a synthetic test WAV file (sine tone) for automated integration testing
/// without needing a physical microphone.
pub fn write_test_wav(
    path: &Path,
    sample_rate: u32,
    duration_ms: u32,
    freq_hz: f32,
) -> Result<(), String> {
    let total_samples = (sample_rate as f32 * (duration_ms as f32 / 1000.0)) as usize;
    let mut samples = Vec::with_capacity(total_samples);

    for i in 0..total_samples {
        let t = i as f32 / sample_rate as f32;
        let val = (2.0 * std::f32::consts::PI * freq_hz * t).sin();
        let pcm = (val * 16384.0) as i16;
        samples.push(pcm);
    }

    write_wav_file(path, sample_rate, &samples)
}

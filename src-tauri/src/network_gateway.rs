//! Native HTTP network gateway for dispatching multimodal queries, speech-to-text,
//! and speech synthesis to the FastAPI cloud backend.

use reqwest::multipart::{Form, Part};
use std::path::Path;

const DEFAULT_BACKEND_URL: &str = "http://127.0.0.1:8000";

/// Resolve base backend URL.
fn resolve_base_url(backend_url: Option<String>) -> String {
    backend_url
        .filter(|u| !u.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_BACKEND_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

/// Detect MIME type based on file extension.
fn detect_mime_type(filename: &str) -> &'static str {
    let lower = filename.to_lowercase();
    if lower.ends_with(".csv") {
        "text/csv"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

/// Dispatches a process request (tabular, image, or text reasoning) to POST /api/v1/process.
pub async fn dispatch_process(
    prompt: String,
    data_type: String,
    file_path: Option<String>,
    backend_url: Option<String>,
) -> Result<serde_json::Value, String> {
    let base = resolve_base_url(backend_url);
    let url = format!("{}/api/v1/process", base);
    let client = reqwest::Client::new();

    let mut form = Form::new()
        .text("prompt", prompt)
        .text("data_type", data_type.clone());

    let normalized_type = data_type.trim().to_lowercase();
    if (normalized_type == "tabular" || normalized_type == "image") && file_path.is_some() {
        let path_str = file_path.unwrap();
        let path = Path::new(&path_str);
        if !path.exists() {
            return Err(format!("Attached file does not exist at '{}'", path_str));
        }

        let file_bytes = std::fs::read(path)
            .map_err(|e| format!("Failed to read file '{}': {}", path_str, e))?;

        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("upload.bin")
            .to_string();

        let mime = detect_mime_type(&filename);
        let part = Part::bytes(file_bytes)
            .file_name(filename)
            .mime_str(mime)
            .map_err(|e| format!("Invalid MIME format: {}", e))?;

        form = form.part("file", part);
    }

    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Network request to {} failed: {}", url, e))?;

    let status = response.status();
    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("Backend error ({}) from {}: {}", status, url, err_text));
    }

    let json_res = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse response JSON from {}: {}", url, e))?;

    Ok(json_res)
}

/// Dispatches an audio file to POST /api/v1/transcribe for Groq Whisper transcription.
pub async fn dispatch_transcribe(
    audio_path: String,
    backend_url: Option<String>,
) -> Result<String, String> {
    let base = resolve_base_url(backend_url);
    let url = format!("{}/api/v1/transcribe", base);
    let client = reqwest::Client::new();

    let path = Path::new(&audio_path);
    if !path.exists() {
        return Err(format!("Audio file does not exist at '{}'", audio_path));
    }

    let audio_bytes = std::fs::read(path)
        .map_err(|e| format!("Failed to read audio file '{}': {}", audio_path, e))?;

    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("voice.wav")
        .to_string();

    let part = Part::bytes(audio_bytes)
        .file_name(filename)
        .mime_str("audio/wav")
        .map_err(|e| format!("Failed to construct audio part: {}", e))?;

    let form = Form::new().part("audio", part);

    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Network request to {} failed: {}", url, e))?;

    let status = response.status();
    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("Transcription failed ({}): {}", status, err_text));
    }

    let json_res = response
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse JSON response: {}", e))?;

    let transcribed_text = json_res
        .get("text")
        .and_then(|t| t.as_str())
        .unwrap_or("")
        .to_string();

    Ok(transcribed_text)
}

/// Dispatches text to POST /api/v1/speak for ElevenLabs speech synthesis,
/// returning raw MP3 bytes.
pub async fn dispatch_speak(
    text: String,
    backend_url: Option<String>,
) -> Result<Vec<u8>, String> {
    let base = resolve_base_url(backend_url);
    let url = format!("{}/api/v1/speak", base);
    let client = reqwest::Client::new();

    let form = Form::new().text("text", text);

    let response = client
        .post(&url)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Network request to {} failed: {}", url, e))?;

    let status = response.status();
    if !status.is_success() {
        let err_text = response.text().await.unwrap_or_default();
        return Err(format!("Speech synthesis failed ({}): {}", status, err_text));
    }

    let audio_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Failed to read response audio bytes: {}", e))?;

    Ok(audio_bytes.to_vec())
}

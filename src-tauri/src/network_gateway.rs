//! Native HTTP network gateway for dispatching multimodal queries, speech-to-text,
//! speech synthesis, and authentication verification to the FastAPI cloud backend.

use reqwest::multipart::{Form, Part};
use std::path::Path;

const DEFAULT_BACKEND_URL: &str = "http://127.0.0.1:8000";

/// Resolve base backend URL.
fn resolve_base_url(backend_url: Option<String>) -> String {
    if let Some(url) = backend_url {
        let trimmed = url.trim();
        if !trimmed.is_empty() {
            return trimmed.trim_end_matches('/').to_string();
        }
    }
    if let Ok(val) = std::env::var("POTATOCLAW_BACKEND_URL") {
        let trimmed = val.trim();
        if !trimmed.is_empty() {
            return trimmed.trim_end_matches('/').to_string();
        }
    }
    DEFAULT_BACKEND_URL.trim_end_matches('/').to_string()
}

/// Resolve access code from explicit override, environment variable, or candidate .env files.
fn resolve_access_code(override_code: Option<String>) -> Option<String> {
    if let Some(code) = override_code {
        let trimmed = code.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    if let Ok(val) = std::env::var("ACCESS_CODE") {
        let trimmed = val.trim().to_string();
        if !trimmed.is_empty() {
            return Some(trimmed);
        }
    }
    for candidate in &["../.env", ".env", "../../.env"] {
        if let Ok(content) = std::fs::read_to_string(candidate) {
            for line in content.lines() {
                let trimmed = line.trim();
                if trimmed.starts_with("ACCESS_CODE=") {
                    let code = trimmed
                        .trim_start_matches("ACCESS_CODE=")
                        .trim()
                        .trim_matches('"')
                        .trim_matches('\'');
                    if !code.is_empty() {
                        return Some(code.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Detect MIME type based on file extension.
fn detect_mime_type(filename: &str) -> &'static str {
    let lower = filename.to_lowercase();
    if lower.ends_with(".csv") {
        "text/csv"
    } else if lower.ends_with(".tsv") {
        "text/tab-separated-values"
    } else if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".bmp") {
        "image/bmp"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".svg") {
        "image/svg+xml"
    } else if lower.ends_with(".pdf") {
        "application/pdf"
    } else if lower.ends_with(".docx") {
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    } else if lower.ends_with(".txt")
        || lower.ends_with(".md")
        || lower.ends_with(".py")
        || lower.ends_with(".rs")
        || lower.ends_with(".js")
        || lower.ends_with(".ts")
        || lower.ends_with(".json")
        || lower.ends_with(".yaml")
        || lower.ends_with(".toml")
        || lower.ends_with(".xml")
        || lower.ends_with(".html")
        || lower.ends_with(".css")
        || lower.ends_with(".sql")
        || lower.ends_with(".sh")
        || lower.ends_with(".bat")
        || lower.ends_with(".ps1")
        || lower.ends_with(".log")
        || lower.ends_with(".env")
    {
        "text/plain"
    } else {
        "application/octet-stream"
    }
}

pub async fn dispatch_process(
    mut prompt: String,
    data_type: String,
    file_path: Option<String>,
    file_paths: Option<Vec<String>>,
    backend_url: Option<String>,
    access_code: Option<String>,
) -> Result<serde_json::Value, String> {
    let base = resolve_base_url(backend_url);
    let url = format!("{}/api/v1/process", base);
    let client = reqwest::Client::new();

    // If multiple documents/files are attached, read each and include in prompt
    let all_paths = if let Some(ref list) = file_paths {
        if !list.is_empty() {
            list.clone()
        } else if let Some(ref single) = file_path {
            vec![single.clone()]
        } else {
            vec![]
        }
    } else if let Some(ref single) = file_path {
        vec![single.clone()]
    } else {
        vec![]
    };

    if data_type == "text" && !all_paths.is_empty() {
        let mut attached_text = String::new();
        for p in &all_paths {
            let path = Path::new(p);
            if path.exists() {
                if let Ok(content) = std::fs::read_to_string(path) {
                    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("document");
                    attached_text.push_str(&format!("[Attached Document: {}]:\n{}\n\n", name, content));
                }
            }
        }
        if !attached_text.is_empty() {
            prompt = format!("{}\n\n{}", attached_text, prompt);
        }
    }

    let mut form = Form::new()
        .text("prompt", prompt)
        .text("data_type", data_type.clone());

    if let Some(ref path_str) = file_path {
        let (file_bytes, filename, mime) = if path_str.starts_with("http://") || path_str.starts_with("https://") {
            let res = client
                .get(path_str)
                .send()
                .await
                .map_err(|e| format!("Failed to download web resource from '{}': {}", path_str, e))?;

            let status = res.status();
            if !status.is_success() {
                return Err(format!("Web resource at '{}' returned HTTP {}", path_str, status));
            }

            let url_path = path_str.split('?').next().unwrap_or(path_str);
            let mut name = url_path.rsplit('/').next().unwrap_or("web_resource").to_string();
            if name.is_empty() || !name.contains('.') {
                name = "downloaded_image.png".to_string();
            }

            let bytes = res
                .bytes()
                .await
                .map_err(|e| format!("Failed to read web resource bytes: {}", e))?
                .to_vec();

            let detected_mime = detect_mime_type(&name);
            (bytes, name, detected_mime)
        } else {
            let path = Path::new(path_str);
            if !path.exists() {
                return Err(format!("Attached file does not exist at '{}'", path_str));
            }

            let bytes = std::fs::read(path)
                .map_err(|e| format!("Failed to read file '{}': {}", path_str, e))?;

            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("upload.bin")
                .to_string();

            let detected_mime = detect_mime_type(&name);
            (bytes, name, detected_mime)
        };

        let part = Part::bytes(file_bytes)
            .file_name(filename)
            .mime_str(mime)
            .map_err(|e| format!("Invalid MIME format: {}", e))?;

        form = form.part("file", part);
    }

    let mut req = client.post(&url).multipart(form);
    if let Some(code) = resolve_access_code(access_code) {
        req = req.header("X-Access-Code", code);
    }

    let response = req
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
    access_code: Option<String>,
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

    let mut req = client.post(&url).multipart(form);
    if let Some(code) = resolve_access_code(access_code) {
        req = req.header("X-Access-Code", code);
    }

    let response = req
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
    access_code: Option<String>,
) -> Result<Vec<u8>, String> {
    let base = resolve_base_url(backend_url);
    let url = format!("{}/api/v1/speak", base);
    let client = reqwest::Client::new();

    let form = Form::new().text("text", text);

    let mut req = client.post(&url).multipart(form);
    if let Some(code) = resolve_access_code(access_code) {
        req = req.header("X-Access-Code", code);
    }

    let response = req
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

/// Probes {base_url}/api/v1/auth/verify to validate backend connectivity and Access Code.
pub async fn dispatch_verify_auth(
    backend_url: Option<String>,
    access_code: Option<String>,
) -> Result<serde_json::Value, String> {
    let base = resolve_base_url(backend_url);
    let url = format!("{}/api/v1/auth/verify", base);
    let client = reqwest::Client::new();

    let mut req = client.post(&url);
    if let Some(code) = resolve_access_code(access_code) {
        req = req.header("X-Access-Code", code);
    }

    let response = req
        .send()
        .await
        .map_err(|e| format!("Connection failed: {}", e))?;

    let status = response.status();
    if status == reqwest::StatusCode::OK {
        let json_res = response
            .json::<serde_json::Value>()
            .await
            .map_err(|e| format!("Failed to parse response JSON from {}: {}", url, e))?;
        Ok(json_res)
    } else if status == reqwest::StatusCode::UNAUTHORIZED {
        Err("Unauthorized: Invalid access code".to_string())
    } else {
        let err_text = response.text().await.unwrap_or_default();
        Err(format!("Backend error ({}) from {}: {}", status, url, err_text))
    }
}

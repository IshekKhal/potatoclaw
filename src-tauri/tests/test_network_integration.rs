use potatoclaw_lib::audio_engine::write_test_wav;
use potatoclaw_lib::memory_shield::{get_active_foreground_pid, trim_idle_background_processes};
use potatoclaw_lib::network_gateway::{
    dispatch_process, dispatch_speak, dispatch_transcribe, dispatch_verify_auth,
};
use potatoclaw_lib::screen_capture::capture_screen_region;
use std::fs;
use std::path::Path;

const BACKEND_URL: &str = "http://127.0.0.1:8000";

#[tokio::test]
async fn test_verify_connection_pipeline() {
    let access_code = std::env::var("ACCESS_CODE").unwrap_or_else(|_| {
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
                            return code.to_string();
                        }
                    }
                }
            }
        }
        "849201".to_string()
    });

    // Valid access code probe
    let result = dispatch_verify_auth(Some(BACKEND_URL.to_string()), Some(access_code)).await;
    assert!(
        result.is_ok(),
        "Valid access code must be authorized: {:?}",
        result.err()
    );
    let json = result.unwrap();
    assert_eq!(
        json.get("status").and_then(|s| s.as_str()),
        Some("authorized"),
        "Status must be 'authorized'"
    );

    // Invalid access code probe
    let invalid_result = dispatch_verify_auth(
        Some(BACKEND_URL.to_string()),
        Some("invalid_code_999999".to_string()),
    )
    .await;
    assert!(
        invalid_result.is_err(),
        "Invalid access code must return Err"
    );
    let err_msg = invalid_result.unwrap_err();
    assert!(
        err_msg.to_lowercase().contains("unauthorized") || err_msg.contains("401"),
        "Error message must indicate unauthorized or HTTP 401: {}",
        err_msg
    );
    println!("test_verify_connection_pipeline PASSED.");
}

#[tokio::test]
async fn test_text_reasoning_pipeline() {
    let prompt = "Write a 1-line Python lambda to square a number.".to_string();
    let result = dispatch_process(
        prompt,
        "text".to_string(),
        None,
        None,
        Some(BACKEND_URL.to_string()),
        None,
    )
    .await;

    assert!(result.is_ok(), "Text reasoning request must succeed: {:?}", result.err());
    let json = result.unwrap();

    assert_eq!(json.get("status").and_then(|s| s.as_str()), Some("success"));
    let sol_type = json.get("type").and_then(|t| t.as_str());
    assert!(
        sol_type == Some("text_solution") || sol_type == Some("code_solution"),
        "Expected text_solution or code_solution, got: {:?}",
        sol_type
    );

    let answer = json.get("answer").and_then(|a| a.as_str()).unwrap_or("");
    assert!(!answer.is_empty(), "Answer from Gemma 4 reasoning must not be empty");
    println!("test_text_reasoning_pipeline PASSED. Answer preview:\n{}", &answer[..std::cmp::min(100, answer.len())]);
}

#[tokio::test]
async fn test_tabular_analysis_pipeline() {
    let temp_csv = std::env::temp_dir().join("test_telemetry.csv");
    let mut csv_content = String::from("index,sensor_value\n");
    for i in 1..=49 {
        csv_content.push_str(&format!("{},{:.2}\n", i, 10.0 + (i as f32 * 0.05)));
    }
    // Inject extreme statistical anomaly
    csv_content.push_str("50,250.75\n");
    fs::write(&temp_csv, csv_content).expect("Failed to write temporary test CSV");

    let prompt = "Explain any sensor anomalies in this dataset.".to_string();
    let result = dispatch_process(
        prompt,
        "tabular".to_string(),
        Some(temp_csv.to_string_lossy().to_string()),
        None,
        Some(BACKEND_URL.to_string()),
        None,
    )
    .await;

    let _ = fs::remove_file(&temp_csv);

    assert!(result.is_ok(), "Tabular analysis must succeed: {:?}", result.err());
    let json = result.unwrap();

    assert_eq!(json.get("status").and_then(|s| s.as_str()), Some("success"));
    assert_eq!(json.get("type").and_then(|t| t.as_str()), Some("tabular_solution"));

    let metrics = json.get("metrics").expect("Metrics must be present in tabular response");
    assert!(
        metrics.get("detected_anomalies_count").is_some() || metrics.get("outlier_indices").is_some(),
        "Metrics must contain detected_anomalies_count or outlier_indices: {:?}",
        metrics
    );

    let answer = json.get("answer").and_then(|a| a.as_str()).unwrap_or("");
    assert!(!answer.is_empty(), "Two-pass synthesis answer must not be empty");
    println!("test_tabular_analysis_pipeline PASSED with verified TabPFN metrics.");
}

#[tokio::test]
async fn test_multimodal_vision_pipeline() {
    let temp_png = std::env::temp_dir().join("test_snip_region.png");
    let img = image::RgbImage::new(100, 100);
    img.save(&temp_png).expect("Failed to write temporary test PNG");

    let prompt = "Explain this screen capture and identify any notable elements.".to_string();
    let result = dispatch_process(
        prompt,
        "image".to_string(),
        Some(temp_png.to_string_lossy().to_string()),
        None,
        Some(BACKEND_URL.to_string()),
        None,
    )
    .await;

    let _ = fs::remove_file(&temp_png);

    assert!(result.is_ok(), "Multimodal vision must succeed: {:?}", result.err());
    let json = result.unwrap();

    assert_eq!(json.get("status").and_then(|s| s.as_str()), Some("success"));
    assert_eq!(json.get("type").and_then(|t| t.as_str()), Some("vision_solution"));

    let answer = json.get("answer").and_then(|a| a.as_str()).unwrap_or("");
    assert!(!answer.is_empty(), "Vision response must not be empty");
    println!("test_multimodal_vision_pipeline PASSED.");
}

#[tokio::test]
async fn test_speech_synthesis_pipeline() {
    let text = "PotatoClaw systems verified and ready.".to_string();
    let result = dispatch_speak(text, Some(BACKEND_URL.to_string()), None).await;

    assert!(result.is_ok(), "Speech synthesis request must succeed: {:?}", result.err());
    let audio_bytes = result.unwrap();

    assert!(audio_bytes.len() > 1000, "Audio MP3 stream must be > 1000 bytes, got {}", audio_bytes.len());
    println!("test_speech_synthesis_pipeline PASSED (received {} MP3 bytes).", audio_bytes.len());
}

#[tokio::test]
async fn test_transcribe_audio_pipeline() {
    let temp_wav = std::env::temp_dir().join("test_tone.wav");
    let gen_res = write_test_wav(&temp_wav, 16000, 500, 440.0);
    assert!(gen_res.is_ok(), "Failed to generate test WAV file: {:?}", gen_res.err());

    let result = dispatch_transcribe(
        temp_wav.to_string_lossy().to_string(),
        Some(BACKEND_URL.to_string()),
        None,
    )
    .await;
    let _ = fs::remove_file(&temp_wav);

    assert!(result.is_ok(), "Groq Whisper transcription must complete: {:?}", result.err());
    println!("test_transcribe_audio_pipeline PASSED.");
}

#[test]
fn test_memory_shield_and_snip_regression() {
    let fg_pid = get_active_foreground_pid();
    let report = trim_idle_background_processes(100 * 1024 * 1024);

    assert!(report.processes_scanned > 0, "Processes scanned must be > 0");
    assert!(report.total_mb_reclaimed >= 0.0, "Reclaimed memory must not be negative");

    if fg_pid != 0 {
        for detail in &report.details {
            assert_ne!(detail.pid, fg_pid, "Foreground PID {} must be strictly protected", fg_pid);
        }
    }

    let snip_result = capture_screen_region(0, 0, 50, 50);
    assert!(snip_result.is_ok(), "Screen capture must succeed: {:?}", snip_result.err());

    let file_path = snip_result.unwrap();
    let path = Path::new(&file_path);
    assert!(path.exists(), "Captured screenshot file must exist");
    assert!(file_path.ends_with(".png"), "Must be a PNG file");

    let _ = fs::remove_file(path);
    println!("test_memory_shield_and_snip_regression PASSED.");
}

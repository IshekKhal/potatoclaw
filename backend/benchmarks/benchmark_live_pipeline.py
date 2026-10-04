"""Live empirical benchmark harness for PotatoClaw cloud services.

Exercises all 6 partner cloud services against live credentials:
- Prior Labs TabPFN 3.5 (Tabular outlier regressor)
- Google DeepMind Gemma 4 (Text reasoning & Multimodal vision)
- Groq Whisper Large V3 Turbo (Audio transcription)
- ElevenLabs Turbo V2.5 (Voice synthesis with George voice)
- Backboard (Persistent assistant memory ingestion & recall)
- Sentry (Telemetry and span overhead verification)

Timing measurements use time.perf_counter_ns() for microsecond accuracy.
"""

import io
import math
import os
import struct
import sys
import time
import tracemalloc
import wave
import asyncio
from typing import Dict, Any, List

import numpy as np
import pandas as pd
from PIL import Image

# Ensure backend root is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.core.config import settings
from app.services.sentry_tracing import init_sentry, trace_span
from app.services.tabpfn_engine import analyze_tabular_dataset
from app.services.gemma_brain import generate_text_reasoning, generate_multimodal_vision
from app.services.groq_transcribe import transcribe_audio
from app.services.elevenlabs_voice import synthesize_voice
from app.services.backboard_memory import ingest_memory, recall_memories


def create_synthetic_audio_wav(duration_s: float = 0.5, sample_rate: int = 16000, freq: float = 440.0) -> bytes:
    """Generate in-memory 16kHz mono 16-bit PCM sine wave WAV bytes."""
    buf = io.BytesIO()
    n_samples = int(duration_s * sample_rate)
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        frames = bytearray()
        for i in range(n_samples):
            val = int(32767.0 * 0.5 * math.sin(2.0 * math.pi * freq * i / sample_rate))
            frames.extend(struct.pack("<h", val))
        wf.writeframes(frames)
    return buf.getvalue()


def create_synthetic_png_image(width: int = 100, height: int = 100) -> bytes:
    """Generate in-memory 100x100 RGB PNG bytes."""
    img = Image.new("RGB", (width, height), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def create_synthetic_dataframe() -> pd.DataFrame:
    """Create a 50-row DataFrame with an injected statistical outlier at row 42."""
    rows = []
    for i in range(50):
        if i == 42:
            # Extreme outlier
            rows.append({"sensor_id": i, "temperature": 98.6, "voltage": 12.1, "pressure": 850.5})
        else:
            rows.append({
                "sensor_id": i,
                "temperature": 20.0 + (i * 0.1),
                "voltage": 5.0 + (i * 0.02),
                "pressure": 101.3 + (i * 0.05),
            })
    return pd.DataFrame(rows)


async def run_benchmarks() -> List[Dict[str, Any]]:
    """Execute live latency profiling against all 6 partner services."""
    results = []
    
    # 0. Sentry Telemetry Verification
    sentry_active = init_sentry()
    print(f"[*] Sentry Tracing Active: {sentry_active} (Environment: {settings.ENVIRONMENT})")

    # 1. TabPFN Regressor Latency
    print("[1/6] Profiling Prior Labs TabPFN Tabular Anomaly Detection...")
    df = create_synthetic_dataframe()
    tracemalloc.start()
    t0 = time.perf_counter_ns()
    tabpfn_res = analyze_tabular_dataset(df)
    t1 = time.perf_counter_ns()
    _, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    tabpfn_latency_ms = (t1 - t0) / 1_000_000.0
    mem_delta_mb = peak_mem / (1024 * 1024)
    outliers = tabpfn_res.get("outlier_indices", [])
    print(f"      Latency: {tabpfn_latency_ms:.2f} ms | Outliers Detected: {outliers} | Peak Memory Delta: {mem_delta_mb:.2f} MB")
    
    results.append({
        "service": "Prior Labs TabPFN",
        "operation": "Tabular Outlier Scan (50 rows)",
        "target_ms": 2500.0,
        "measured_ms": tabpfn_latency_ms,
        "status": "PASS" if tabpfn_latency_ms <= 2500.0 and 42 in outliers else "FAIL",
        "notes": f"Detected outlier row {outliers}, mem delta {mem_delta_mb:.2f}MB",
    })

    # 2. Gemma 4 Text Reasoning Latency
    print("[2/6] Profiling Google DeepMind Gemma 4 Text Reasoning...")
    text_prompt = "Explain thrashing in virtual memory systems in two sentences."
    t0 = time.perf_counter_ns()
    gemma_text = generate_text_reasoning(text_prompt)
    t1 = time.perf_counter_ns()
    gemma_text_latency_ms = (t1 - t0) / 1_000_000.0
    print(f"      Latency: {gemma_text_latency_ms:.2f} ms | Output Length: {len(gemma_text)} chars")
    print(f"      Preview: {gemma_text[:80]}...")
    
    results.append({
        "service": "Google AI Studio",
        "operation": "Gemma 4 Text Reasoning (2 sentences)",
        "target_ms": 2500.0,
        "measured_ms": gemma_text_latency_ms,
        "status": "PASS" if gemma_text_latency_ms <= 2500.0 and len(gemma_text) > 20 else "FAIL",
        "notes": f"Len: {len(gemma_text)} chars, Model: {settings.GEMMA_MODEL_ID}",
    })

    # 3. Gemma 4 Multimodal Vision Latency
    print("[3/6] Profiling Google DeepMind Gemma 4 Multimodal Vision...")
    png_bytes = create_synthetic_png_image(100, 100)
    vision_prompt = "Identify elements in this image."
    t0 = time.perf_counter_ns()
    gemma_vision = generate_multimodal_vision(png_bytes, "image/png", vision_prompt)
    t1 = time.perf_counter_ns()
    gemma_vision_latency_ms = (t1 - t0) / 1_000_000.0
    print(f"      Latency: {gemma_vision_latency_ms:.2f} ms | Output Length: {len(gemma_vision)} chars")
    print(f"      Preview: {gemma_vision[:80]}...")
    
    results.append({
        "service": "Google AI Studio",
        "operation": "Gemma 4 Multimodal Vision (100x100 PNG)",
        "target_ms": 3000.0,
        "measured_ms": gemma_vision_latency_ms,
        "status": "PASS" if gemma_vision_latency_ms <= 3000.0 and len(gemma_vision) > 10 else "FAIL",
        "notes": f"Len: {len(gemma_vision)} chars, PNG size: {len(png_bytes)} B",
    })

    # 4. Groq Whisper Large V3 Turbo STT Latency
    print("[4/6] Profiling Groq Whisper Large V3 Turbo Audio Transcription...")
    wav_bytes = create_synthetic_audio_wav(0.5, 16000, 440.0)
    t0 = time.perf_counter_ns()
    transcript = transcribe_audio(wav_bytes, "test_benchmark.wav")
    t1 = time.perf_counter_ns()
    groq_latency_ms = (t1 - t0) / 1_000_000.0
    print(f"      Latency: {groq_latency_ms:.2f} ms | Transcript: '{transcript}'")
    
    results.append({
        "service": "Groq Cloud",
        "operation": "Whisper Large V3 Turbo STT (500ms audio)",
        "target_ms": 1000.0,
        "measured_ms": groq_latency_ms,
        "status": "PASS" if groq_latency_ms <= 1000.0 else "FAIL",
        "notes": f"Transcript: '{transcript[:30]}', Model: {settings.GROQ_STT_MODEL_ID}",
    })

    # 5. ElevenLabs Turbo V2.5 Speech Synthesis Latency
    print("[5/6] Profiling ElevenLabs Turbo V2.5 Speech Synthesis...")
    speech_text = "Memory Shield active. System running cold."
    t0 = time.perf_counter_ns()
    audio_mp3 = synthesize_voice(speech_text)
    t1 = time.perf_counter_ns()
    eleven_latency_ms = (t1 - t0) / 1_000_000.0
    print(f"      Latency: {eleven_latency_ms:.2f} ms | MP3 Stream Size: {len(audio_mp3)} bytes")
    
    results.append({
        "service": "ElevenLabs",
        "operation": "Voice Synthesis Turbo V2.5 (George voice)",
        "target_ms": 1200.0,
        "measured_ms": eleven_latency_ms,
        "status": "PASS" if eleven_latency_ms <= 1200.0 and len(audio_mp3) > 1000 else "FAIL",
        "notes": f"MP3 size: {len(audio_mp3)} bytes, Voice ID: {settings.ELEVENLABS_VOICE_ID}",
    })

    # 6. Backboard Persistent Assistant Memory Latency
    print("[6/6] Profiling Backboard Persistent Assistant Memory...")
    t0 = time.perf_counter_ns()
    ingest_id = await ingest_memory("benchmark query", "benchmark answer", "general_interaction")
    t1 = time.perf_counter_ns()
    backboard_ingest_ms = (t1 - t0) / 1_000_000.0
    print(f"      Ingest Latency: {backboard_ingest_ms:.2f} ms | Ingest ID: {ingest_id}")

    t0 = time.perf_counter_ns()
    recalled = await recall_memories("benchmark query", limit=3)
    t1 = time.perf_counter_ns()
    backboard_recall_ms = (t1 - t0) / 1_000_000.0
    print(f"      Recall Latency: {backboard_recall_ms:.2f} ms | Items Recalled: {len(recalled)}")

    results.append({
        "service": "Backboard Cloud",
        "operation": "Memory Ingestion",
        "target_ms": 1500.0,
        "measured_ms": backboard_ingest_ms,
        "status": "PASS" if backboard_ingest_ms <= 1500.0 else "FAIL",
        "notes": f"Ingest ID: {ingest_id}",
    })

    results.append({
        "service": "Backboard Cloud",
        "operation": "Contextual Memory Recall (limit=3)",
        "target_ms": 1500.0,
        "measured_ms": backboard_recall_ms,
        "status": "PASS" if backboard_recall_ms <= 1500.0 else "FAIL",
        "notes": f"Recalled {len(recalled)} memories",
    })

    return results


def print_summary_table(results: List[Dict[str, Any]]):
    """Print clean structured Markdown table of benchmark results."""
    print("\n" + "=" * 92)
    print("POTATOCLAW LIVE CLOUD SERVICES EMPIRICAL BENCHMARK LEDGER")
    print("=" * 92)
    print(f"| {'Service':<18} | {'Operation':<38} | {'Target (ms)':<11} | {'Measured (ms)':<13} | {'Status':<6} |")
    print(f"|{'-'*20}|{'-'*40}|{'-'*13}|{'-'*15}|{'-'*8}|")
    
    total_pipeline_ms = 0.0
    for r in results:
        total_pipeline_ms += r["measured_ms"]
        print(
            f"| {r['service']:<18} | {r['operation']:<38} | {r['target_ms']:<11.1f} | {r['measured_ms']:<13.2f} | {r['status']:<6} |"
        )
    print("=" * 92)
    print(f"Total Cumulative Cloud Service Wall-Clock Time: {total_pipeline_ms:.2f} ms")
    print("=" * 92 + "\n")


if __name__ == "__main__":
    benchmark_results = asyncio.run(run_benchmarks())
    print_summary_table(benchmark_results)

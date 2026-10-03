# PotatoClaw · 8GB laptop pe bhi code daudega, freeze nahi hoga

A featherweight desktop AI companion and Win32 anti-thrash memory shield for students on 8GB RAM laptops. When compiling C code or running dev servers with Chrome open, memory hits 93% and Windows freezes in pagefile thrashing. Click the 60px floating pill, and native Win32 `EmptyWorkingSet` flushes inactive background pages to standby, freeing **1.7 GB to 6.4 GB** of physical RAM in 0.24 seconds without closing tabs or killing apps. Multimodal code debugging, screen snips, and lab data outlier detection offload to a free FastAPI backend on [Render](https://render.com) powered by Google DeepMind's open-weight [Gemma 4](https://ai.google.dev/gemma) and Prior Labs' [TabPFN](https://tabpfn.com). Spoken audio debriefs stream via [ElevenLabs](https://elevenlabs.io) with [Sentry](https://sentry.io) distributed tracing. The demo backend is live at **https://potatoclaw-api.onrender.com/health** (free tier, ~45s cold start).

Built for Rudra for the DEV Hacktoberfest Weekend Challenge "Build for a Friend" (Oct 2026).

## How it works

```
Screen snip (Alt+Shift+2) / CSV / Voice ─▶ FastAPI Gateway ─▶ Gemma 4 26B (two-pass code fix)
                                       ▲         │           TabPFN 3.5 (178ms outlier scan)
                                       │         ▼           ElevenLabs Turbo (voice debrief)
Desktop Pill ──▶ Win32 EmptyWorkingSet ─┴── Sentry telemetry
(reclaims 1.7-6.4 GB in 0.24s; client idles at 0.74 MB)
```

* `src-tauri/src/memory_shield.rs` – Win32 FFI calling `K32EmptyWorkingSet` with foreground PID protection.
* `src-tauri/src/screen_capture.rs` – Native GDI screen snipper writing cropped PNGs without opening Paint.
* `src-tauri/src/network_gateway.rs` – Multipart reqwest streaming directly from disk paths to bypass WebView sandbox.
* `backend/app/services/gemma_brain.py` – Two-pass code reasoning and multimodal vision via `google-genai`.
* `backend/app/services/tabpfn_engine.py` – Zero-shot tabular anomaly detection via `tabpfn-client`.
* `ui/` – Featherweight WebView2 interfaces (60px floating pill, assistant HUD, transparent crosshair canvas).

## Run it yourself

```powershell
# 1. Backend
cd backend
python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp ../.env.example .env                          # add GEMINI, TABPFN, GROQ, ELEVENLABS, SENTRY keys
uvicorn app.main:app --port 8000 --reload        # http://127.0.0.1:8000

# 2. Desktop Client
cd ../src-tauri
cargo run                                        # dev mode with live hotkeys
cargo build --release                            # -> 19 MB standalone: target/release/potatoclaw.exe
```

Hotkeys: `Alt+Shift+P` (HUD), `Alt+Shift+2` (snip), `Alt+Shift+1` (clipboard), `Alt+Shift+V` (voice). Left-click pill to open HUD; right-click to trim RAM.

## Results

```
Physical RAM Reclaimed:  1,719 MB (automated test) to 6,441 MB (multi-tab browsing)
Trim Execution Latency:  0.24 seconds across 320+ scanned PIDs
Client Idle Resident:    0.74 MB (drops from 43 MB on boot after self-trim)
Total Monthly Cost:      ₹0.00 / $0.00 (verified on free tiers across all 5 services)
```

## Why open weights

* **8GB laptops cannot load frontier models locally.** Cloud offloading to open-weight models keeps the laptop cold and pagefile thrashing at zero.
* **Student economics are binary.** $20/month subscriptions don't fit a hostel budget. Open weights on free developer tiers cost ₹0.00.
* **Systems engineering over web bloat.** Electron burns 250 MB for a blank window. Tauri v2 in Rust idles at 0.74 MB and gives RAM back to the OS.

# PotatoClaw · Universal AI companion & Win32 memory shield for 8GB laptops

A featherweight desktop AI companion and Win32 anti-thrash memory shield for anyone on 8GB RAM laptops (students, writers, researchers, developers, office workers). When multitasking across multiple browser tabs, documents, spreadsheets, PDFs, or dev tools, physical memory pushes past 90% and Windows freezes in pagefile thrashing. Click the floating pill, and native Win32 `EmptyWorkingSet` with process protection whitelisting flushes inactive background pages to standby, freeing **1.7 GB to 3.5 GB** of physical RAM in 0.24 seconds without closing tabs or killing user daemons. Multimodal reasoning, screen snips, cross-session assistant memory, and tabular data outlier detection offload to a free FastAPI backend on [Render](https://render.com) powered by Google DeepMind's open-weight [Gemma 4](https://ai.google.dev/gemma), Prior Labs' [TabPFN](https://tabpfn.com), and [Backboard.io](https://backboard.io). Spoken audio debriefs stream via [ElevenLabs](https://elevenlabs.io) with [Sentry](https://sentry.io) distributed tracing. The demo backend is live at **https://potatoclaw-api.onrender.com/health** (free tier, ~45s cold start).

Built for Rudra for the DEV Hacktoberfest Weekend Challenge "Build for a Friend" (Oct 2026).

## How it works

```
Screen snip (Alt+P+2) / CSV / Voice ─▶ FastAPI Gateway ─▶ Gemma 4 26B (two-pass multimodal reasoning)
                                       ▲         │        Backboard.io (cross-session memory)
                                       │         │        TabPFN 3.5 (178ms outlier scan)
                                       │         ▼        ElevenLabs Turbo (voice debrief)
Desktop Pill ──▶ Win32 EmptyWorkingSet ┴── Sentry telemetry
(reclaims 1.7-3.5 GB in 0.24s; lightweight native desktop footprint)
```

* `src-tauri/src/memory_shield.rs` – Win32 FFI calling `K32EmptyWorkingSet` with foreground PID and process whitelist protection.
* `src-tauri/src/screen_capture.rs` – Native GDI screen snipper writing cropped PNGs without opening Paint.
* `src-tauri/src/network_gateway.rs` – Multipart reqwest streaming directly from disk paths to bypass WebView sandbox.
* `backend/app/services/gemma_brain.py` – Two-pass universal reasoning and multimodal vision via `google-genai`.
* `backend/app/services/backboard_memory.py` – Persistent assistant memory and contextual RAG via `backboard-sdk`.
* `backend/app/services/tabpfn_engine.py` – Zero-shot tabular anomaly detection via `tabpfn-client`.
* `ui/` – Featherweight WebView2 interfaces (floating pill, assistant HUD with in-HUD Settings, transparent crosshair canvas).

---

## 1-Click Cloud Deployment (For Self-Hosters)

Anyone can deploy their own private PotatoClaw backend on Render for free in 2 minutes:

1. Click **Deploy to Render**:  
   [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)
2. Enter your free API keys (`GEMINI_API_KEY`, `TABPFN_API_KEY`, `GROQ_API_KEY`, `ELEVENLABS_API_KEY`, `BACKBOARD_API_KEY`, `SENTRY_DSN`) and choose an **Access Code** PIN (e.g. `849201`).
3. Render builds your cloud service and gives you a private URL: `https://your-backend.onrender.com`.
4. Open PotatoClaw desktop app $\rightarrow$ click **Settings** $\rightarrow$ paste your URL and Access Code $\rightarrow$ click **Save**.

---

## Run locally from source

```powershell
# 1. Backend
cd backend
python -m venv .venv && .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp ../.env.example .env                          # add GEMINI, TABPFN, GROQ, ELEVENLABS, BACKBOARD, SENTRY keys
uvicorn app.main:app --port 8000 --reload        # http://127.0.0.1:8000

# 2. Desktop Client
cd ../src-tauri
cargo run                                        # dev mode with live hotkeys
cargo build --release                            # -> ~20 MB standalone: target/release/potatoclaw.exe
```

Hotkeys: `Alt+P+P` (HUD toggle), `Alt+P+2` (snip), `Alt+P+1` (clipboard), `Alt+P+V` (voice). Left-click pill to toggle HUD; double-click pill to trigger instant safe memory trim.

## Results

```
Physical RAM Reclaimed:  1,719 MB (automated test) to 3,500+ MB (heavy multi-tab browsing)
Trim Execution Latency:  0.24 seconds across scanned PIDs
Client Footprint:        ~20 MB standalone binary, lightweight native runtime
Total Monthly Cost:      ₹0.00 / $0.00 (verified on free tiers across all 6 services)
```

## Why open weights

* **8GB laptops cannot load frontier models locally.** Cloud offloading to open-weight models keeps the laptop cold and pagefile thrashing at zero.
* **Personal computing economics are binary.** $20/month subscriptions don't fit everyday budgets. Open weights on free developer tiers cost $0.00.
* **Systems engineering over web bloat.** Electron burns 150 MB to 250 MB for a blank window. Tauri v2 in Rust idles at a fraction of that and actively returns RAM to the OS.

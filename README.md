# PotatoClaw 🥔🐾

> A featherweight desktop AI companion and context guardian for 8GB RAM laptops.  
> Built for the **Hacktoberfest Weekend Challenge: Build for a Friend** (October 2–5, 2026).

---

## What is PotatoClaw?

PotatoClaw is an open-source, zero-bloat AI companion engineered for students who code and study on older 8GB RAM laptops. 

Instead of burning 250MB+ on an Electron client or running heavy local LLMs that melt low-spec hardware, PotatoClaw uses an asymmetric architecture:
* **Locally**: A native **Tauri v2** client (<20 MB idle RAM) equipped with a Win32 memory shield that reclaims 500MB to 1.8GB of physical RAM from idle background processes on demand.
* **Remotely**: An open-weight cloud engine on **Render**, combining **Gemma 4 12B IT** (multimodal language brain), **TabPFN 3.5** (instant zero-shot tabular anomaly predictions), **Groq Whisper Large V3 Turbo** (80ms cloud speech-to-text), **ElevenLabs** (spoken audio briefings), and **Sentry 2.71.0** (performance & memory tracing).

---

## Core Features

1. **Namespaced Hotkeys (`Alt + P + [Key]`)**:
   * `Alt + P + 1`: Clipboard text ingest into HUD composer.
   * `Alt + P + 2`: Custom rectangular crosshair snipper (auto-saves PNG locally & attaches).
   * `Alt + P + V`: Voice recording toggle (start / stop) with mic state transition.
   * `Alt + P + P`: Toggle conversational HUD overlay.
2. **Persistent Floating DropBox**: A resizable, draggable top-most desktop widget. Drag any file (`.pdf`, `.py`, `.csv`, `.png`) to stage it into the composer.
3. **Multi-Input Staging Area (Composer HUD)**: Combine screenshots, code snippets, dropped files, and voice notes into one staged context bundle. Remove items with individual `✕` buttons, edit the auto-transcribed prompt, and submit with `Ctrl + Enter`.
4. **Native Win32 Memory Shield**: Flushes idle working sets via `EmptyWorkingSet`, dropping memory pressure before heavy tasks without killing background apps.
5. **Two-Pass Verification**: TabPFN detects tabular anomalies, Gemma 4 synthesizes findings into plain English, and a second pass verifies facts against raw data to eliminate hallucinations.
6. **Zero-Dollar ($0.00) Cost**: Runs entirely on generous free developer tiers across all models and services.

---

## Project Documentation

* 📄 [Product Requirements Document (PRD)](docs/PRD.md)
* 🏗️ [Technical Architecture & Systems Specification](docs/ARCHITECTURE.md)
* 🎯 [Hackathon Strategy & 5-Partner Prize Matrix](docs/HACKATHON_STRATEGY.md)

---

## Hacktoberfest 2026 Partner Prize Matrix

PotatoClaw is built to qualify for 5 official partner categories:
* **Best Use of Render** ($200 USD Featured)
* **Best Use of Gemma** ($200 USD Featured)
* **Best Use of TabPFN** ($200 USD Featured)
* **Best Use of Sentry Agent Tracing** ($100 USD Partner)
* **Best Use of ElevenLabs** ($100 USD Partner)
* **Overall Grand Prize** ($250 USD + DEV++)

---

## License

MIT License — free for students everywhere.

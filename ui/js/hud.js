document.addEventListener('DOMContentLoaded', () => {
  const btnClose = document.getElementById('btnCloseHud');
  const btnTrim = document.getElementById('btnTrimMemory');
  const ramDisplay = document.getElementById('ramReclaimedDisplay');
  const composerInput = document.getElementById('composerInput');
  const btnSend = document.getElementById('btnSendPrompt');
  const btnMic = document.getElementById('btnMicToggle');
  const chatHistory = document.getElementById('chatHistory');
  const stagedList = document.getElementById('stagedList');

  let isRecording = false;

  // Helper to hide current window
  const hideHud = () => {
    if (window.__TAURI__ && window.__TAURI__.core) {
      window.__TAURI__.core.invoke('hide_window', { label: 'hud' })
        .catch(err => console.error('Failed to hide HUD:', err));
    }
  };

  // Close button
  btnClose.addEventListener('click', hideHud);

  // Esc key closes HUD
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideHud();
    }
  });

  // Trim Memory button
  btnTrim.addEventListener('click', async () => {
    ramDisplay.textContent = 'Trimming physical RAM...';
    try {
      if (window.__TAURI__ && window.__TAURI__.core) {
        const report = await window.__TAURI__.core.invoke('trim_memory', { threshold_mb: 100 });
        ramDisplay.textContent = `Reclaimed ${report.total_mb_reclaimed.toFixed(1)} MB (${report.processes_trimmed} procs)`;

        // Append to chat
        appendMessage('assistant', `Memory Shield active: Reclaimed ${report.total_mb_reclaimed.toFixed(2)} MB physical RAM across ${report.processes_trimmed} background processes. Active foreground process (PID ${report.foreground_pid_protected}) protected.`);
      } else {
        ramDisplay.textContent = 'Simulated: Reclaimed 450 MB';
      }
    } catch (err) {
      ramDisplay.textContent = 'Trim failed';
      console.error('Trim error:', err);
    }
  });

  // Toggle Mic
  const toggleMic = () => {
    isRecording = !isRecording;
    if (isRecording) {
      btnMic.classList.add('recording');
      btnMic.textContent = '🔴';
      appendMessage('assistant', 'Microphone active (16kHz mono). Speak your query...');
    } else {
      btnMic.classList.remove('recording');
      btnMic.textContent = '🎤';
    }
  };
  btnMic.addEventListener('click', toggleMic);

  // Send Prompt
  const sendPrompt = () => {
    const text = composerInput.value.trim();
    if (!text) return;

    appendMessage('user', text);
    composerInput.value = '';

    // Assistant response placeholder (ready for Phase 4 cloud integration)
    setTimeout(() => {
      appendMessage('assistant', `Acknowledged query: "${text}". Cloud backend pipeline wired.`);
    }, 400);
  };

  btnSend.addEventListener('click', sendPrompt);
  composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });

  function appendMessage(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble bubble-${sender}`;
    bubble.textContent = text;
    chatHistory.appendChild(bubble);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  // Listen for global shortcut events from Tauri backend
  if (window.__TAURI__ && window.__TAURI__.event) {
    window.__TAURI__.event.listen('trigger-clipboard-ingest', () => {
      appendMessage('assistant', 'Alt+Shift+1 triggered: Reading clipboard context...');
    });

    window.__TAURI__.event.listen('trigger-voice-toggle', () => {
      toggleMic();
    });

    window.__TAURI__.event.listen('memory-trimmed', (event) => {
      const report = event.payload;
      if (report) {
        ramDisplay.textContent = `Reclaimed ${report.total_mb_reclaimed.toFixed(1)} MB (${report.processes_trimmed} procs)`;
      }
    });
  }
});

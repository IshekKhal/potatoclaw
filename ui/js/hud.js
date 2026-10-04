document.addEventListener('DOMContentLoaded', () => {
  // Header elements
  const ramBadge = document.getElementById('ramBadge');
  const ramBadgeText = document.getElementById('ramBadgeText');
  const btnMinHud = document.getElementById('btnMinHud');
  const btnCloseHud = document.getElementById('btnCloseHud');

  // Storage Keys for persistent settings
  const STORAGE_KEY_BACKEND_URL = 'potatoclaw_backend_url';
  const STORAGE_KEY_ACCESS_CODE = 'potatoclaw_access_code';

  // Helper to obtain active config from localStorage
  const getEffectiveConfig = () => ({
    backendUrl: localStorage.getItem(STORAGE_KEY_BACKEND_URL) || null,
    accessCode: localStorage.getItem(STORAGE_KEY_ACCESS_CODE) || null,
  });

  // Settings modal elements
  const btnSettings = document.getElementById('btnSettings');
  const settingsModal = document.getElementById('settingsModal');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const settingBackendUrl = document.getElementById('settingBackendUrl');
  const settingAccessCode = document.getElementById('settingAccessCode');
  const btnToggleAccessCode = document.getElementById('btnToggleAccessCode');
  const connectionStatus = document.getElementById('connectionStatus');
  const connectionStatusText = document.getElementById('connectionStatusText');
  const btnTestConnection = document.getElementById('btnTestConnection');
  const btnSaveSettings = document.getElementById('btnSaveSettings');

  // Initialize Settings Inputs from localStorage
  const initialUrl = localStorage.getItem(STORAGE_KEY_BACKEND_URL);
  const initialCode = localStorage.getItem(STORAGE_KEY_ACCESS_CODE);
  if (initialUrl && settingBackendUrl) settingBackendUrl.value = initialUrl;
  if (initialCode && settingAccessCode) settingAccessCode.value = initialCode;

  // Staged context elements
  const stagedBadgesContainer = document.getElementById('staged-badges');
  const stagedCountHint = document.getElementById('stagedCountHint');

  // Chat feed elements
  const chatFeed = document.getElementById('chat-feed');

  // Composer elements
  const composerInput = document.getElementById('composerInput');
  const btnVoiceToggle = document.getElementById('btnVoiceToggle');
  const voiceIcon = document.getElementById('voiceIcon');
  const voiceLabel = document.getElementById('voiceLabel');
  const btnAttachFile = document.getElementById('btnAttachFile');
  const filePicker = document.getElementById('filePicker');
  const btnClearStaged = document.getElementById('btnClearStaged');
  const btnSendPrompt = document.getElementById('btnSendPrompt');

  // Badge Preview Popover elements
  const badgePreviewPopover = document.getElementById('badgePreviewPopover');
  const popoverTitle = document.getElementById('popoverTitle');
  const popoverLength = document.getElementById('popoverLength');
  const popoverContent = document.getElementById('popoverContent');

  let hoverTimer = null;

  const hidePopover = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    if (badgePreviewPopover) {
      badgePreviewPopover.classList.add('hidden');
    }
  };

  if (badgePreviewPopover) {
    badgePreviewPopover.addEventListener('mouseleave', () => {
      hidePopover();
    });
  }

  // Extract first few words (up to 5 words or 26 chars)
  const getFirstFewWords = (text, maxWords = 5, maxChars = 26) => {
    if (!text) return 'Clipboard text';
    const clean = text.replace(/[\r\n\t]+/g, ' ').trim();
    const words = clean.split(/\s+/);
    let preview = words.slice(0, maxWords).join(' ');
    if (words.length > maxWords || preview.length > maxChars) {
      if (preview.length > maxChars) {
        preview = preview.substring(0, maxChars).trim();
      }
      preview += '...';
    }
    return preview;
  };

  // Staged state array: [{ id, type, name, path, content, meta }]
  let stagedItems = [];
  let isRecording = false;

  // Window hide helper
  const hideHud = () => {
    hidePopover();
    if (window.__TAURI__ && window.__TAURI__.core) {
      window.__TAURI__.core.invoke('hide_window', { label: 'hud' })
        .catch(err => console.error('Failed to hide HUD:', err));
    }
  };

  if (btnMinHud) btnMinHud.addEventListener('click', hideHud);
  if (btnCloseHud) btnCloseHud.addEventListener('click', hideHud);

  // Status indicator helper
  const setConnectionStatus = (statusClass, message) => {
    if (connectionStatus && connectionStatusText) {
      connectionStatus.className = `connection-status ${statusClass}`;
      connectionStatusText.textContent = message;
    }
  };

  // Settings Modal Controls
  const openSettings = () => {
    if (settingsModal) {
      const cfg = getEffectiveConfig();
      if (settingBackendUrl) settingBackendUrl.value = cfg.backendUrl || '';
      if (settingAccessCode) settingAccessCode.value = cfg.accessCode || '';
      setConnectionStatus('idle', 'Status: Ready');
      settingsModal.classList.remove('hidden');
    }
  };

  const closeSettings = () => {
    if (settingsModal) {
      settingsModal.classList.add('hidden');
    }
  };

  if (btnSettings) btnSettings.addEventListener('click', openSettings);
  if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);

  // Password Visibility Toggle
  if (btnToggleAccessCode && settingAccessCode) {
    btnToggleAccessCode.addEventListener('click', () => {
      if (settingAccessCode.type === 'password') {
        settingAccessCode.type = 'text';
        btnToggleAccessCode.textContent = '🙈';
      } else {
        settingAccessCode.type = 'password';
        btnToggleAccessCode.textContent = '👁️';
      }
    });
  }

  // Connection Probing Test Handler
  if (btnTestConnection) {
    btnTestConnection.addEventListener('click', async () => {
      setConnectionStatus('checking', 'Testing connection...');
      const urlVal = settingBackendUrl ? settingBackendUrl.value.trim() : '';
      const codeVal = settingAccessCode ? settingAccessCode.value.trim() : '';

      if (window.__TAURI__ && window.__TAURI__.core) {
        try {
          const res = await window.__TAURI__.core.invoke('verify_connection', {
            backendUrl: urlVal || null,
            accessCode: codeVal || null,
          });
          if (res && res.status === 'authorized') {
            setConnectionStatus('connected', 'Connected: Authorized (HTTP 200)');
          } else {
            setConnectionStatus('unauthorized', 'Unexpected response from server');
          }
        } catch (err) {
          const errStr = String(err);
          if (errStr.toLowerCase().includes('unauthorized') || errStr.includes('401')) {
            setConnectionStatus('unauthorized', 'Unauthorized: Invalid access code (HTTP 401)');
          } else {
            setConnectionStatus('offline', `Connection failed: ${errStr}`);
          }
        }
      } else {
        setConnectionStatus('connected', 'Connected: Authorized (Simulated)');
      }
    });
  }

  // Settings Save Handler
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
      const urlVal = settingBackendUrl ? settingBackendUrl.value.trim() : '';
      const codeVal = settingAccessCode ? settingAccessCode.value.trim() : '';

      if (urlVal) {
        localStorage.setItem(STORAGE_KEY_BACKEND_URL, urlVal);
      } else {
        localStorage.removeItem(STORAGE_KEY_BACKEND_URL);
      }

      if (codeVal) {
        localStorage.setItem(STORAGE_KEY_ACCESS_CODE, codeVal);
      } else {
        localStorage.removeItem(STORAGE_KEY_ACCESS_CODE);
      }

      setConnectionStatus('connected', 'Settings Saved!');
      setTimeout(() => {
        closeSettings();
      }, 400);
    });
  }

  // Esc key closes Settings modal first if open, otherwise hides HUD
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (settingsModal && !settingsModal.classList.contains('hidden')) {
        closeSettings();
        return;
      }
      hideHud();
    }
  });

  // Helper to emit staged count updates to DropBox pill
  const notifyBadgeCountChanged = () => {
    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('staged-count-changed', { count: stagedItems.length }).catch(console.error);
    }
  };

  // Render Staged Badges with Universal Icon Mapping
  const renderStagedBadges = () => {
    stagedBadgesContainer.innerHTML = '';
    if (stagedItems.length === 0) {
      const hint = document.createElement('span');
      hint.className = 'staged-empty-hint';
      hint.textContent = 'Drop files on DropBox pill, press Alt+Shift+1 (clipboard), or Alt+Shift+2 (snip) to stage context';
      stagedBadgesContainer.appendChild(hint);
      if (stagedCountHint) stagedCountHint.textContent = '0 attached';
      notifyBadgeCountChanged();
      return;
    }

    if (stagedCountHint) {
      stagedCountHint.textContent = `${stagedItems.length} attached`;
    }

    stagedItems.forEach((item) => {
      const badge = document.createElement('div');
      badge.className = 'context-badge';
      badge.dataset.id = item.id;

      let icon = '📎';
      const p = (item.path || item.name || '').toLowerCase();
      if (item.type === 'snip') {
        icon = '✂️';
      } else if (item.type === 'clipboard') {
        icon = '📋';
      } else if (item.type === 'url') {
        icon = '🌐';
      } else if (p.endsWith('.csv') || p.endsWith('.tsv')) {
        icon = '📊';
      } else if (
        p.endsWith('.png') ||
        p.endsWith('.jpg') ||
        p.endsWith('.jpeg') ||
        p.endsWith('.webp') ||
        p.endsWith('.bmp') ||
        p.endsWith('.gif') ||
        p.endsWith('.svg')
      ) {
        icon = '🖼️';
      } else if (
        p.endsWith('.py') ||
        p.endsWith('.js') ||
        p.endsWith('.ts') ||
        p.endsWith('.rs') ||
        p.endsWith('.c') ||
        p.endsWith('.cpp') ||
        p.endsWith('.h') ||
        p.endsWith('.cs') ||
        p.endsWith('.java') ||
        p.endsWith('.go') ||
        p.endsWith('.html') ||
        p.endsWith('.css') ||
        p.endsWith('.json') ||
        p.endsWith('.yaml') ||
        p.endsWith('.toml') ||
        p.endsWith('.xml') ||
        p.endsWith('.sql') ||
        p.endsWith('.sh') ||
        p.endsWith('.bat') ||
        p.endsWith('.ps1') ||
        p.endsWith('.log') ||
        p.endsWith('.env')
      ) {
        icon = '💻';
      } else if (
        p.endsWith('.pdf') ||
        p.endsWith('.docx') ||
        p.endsWith('.txt') ||
        p.endsWith('.md')
      ) {
        icon = '📄';
      } else {
        icon = '📦';
      }

      badge.innerHTML = `
        <span class="context-badge-icon">${icon}</span>
        <span class="context-badge-label" title="${item.path || item.name}">${item.name}</span>
        <button class="context-badge-remove" title="Remove">✕</button>
      `;

      // 1.5s hover preview popover for clipboard or text content
      if (item.content) {
        badge.addEventListener('mouseenter', () => {
          if (hoverTimer) clearTimeout(hoverTimer);
          hoverTimer = setTimeout(() => {
            if (!badgePreviewPopover) return;
            const rect = badge.getBoundingClientRect();
            const popoverWidth = 340;

            let left = rect.left;
            if (left + popoverWidth > window.innerWidth - 16) {
              left = window.innerWidth - popoverWidth - 16;
            }
            if (left < 10) left = 10;

            let top = rect.bottom + 6;
            if (top + 180 > window.innerHeight - 10) {
              top = Math.max(10, rect.top - 190);
            }

            badgePreviewPopover.style.left = `${left}px`;
            badgePreviewPopover.style.top = `${top}px`;

            if (popoverTitle) {
              popoverTitle.textContent = item.type === 'clipboard' ? '📋 Clipboard Content' : '📄 Text Content';
            }
            if (popoverLength) {
              popoverLength.textContent = `${item.content.length} chars`;
            }
            if (popoverContent) {
              popoverContent.textContent = item.content;
            }

            badgePreviewPopover.classList.remove('hidden');
          }, 1500);
        });

        badge.addEventListener('mouseleave', (e) => {
          if (hoverTimer) {
            clearTimeout(hoverTimer);
            hoverTimer = null;
          }
          const related = e.relatedTarget;
          if (badgePreviewPopover && (related === badgePreviewPopover || badgePreviewPopover.contains(related))) {
            return;
          }
          hidePopover();
        });
      }

      badge.querySelector('.context-badge-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        hidePopover();
        removeStagedItem(item.id);
      });

      stagedBadgesContainer.appendChild(badge);
    });

    notifyBadgeCountChanged();
  };

  const addStagedItem = (item) => {
    // Avoid duplicate paths
    if (item.path && stagedItems.some(i => i.path === item.path)) {
      return;
    }
    stagedItems.push({
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      ...item,
    });
    renderStagedBadges();
  };

  const removeStagedItem = (id) => {
    stagedItems = stagedItems.filter(i => i.id !== id);
    renderStagedBadges();
    if (stagedItems.length === 0 && window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('badges-cleared').catch(console.error);
    }
  };

  const clearStagedContext = () => {
    stagedItems = [];
    renderStagedBadges();
    composerInput.value = '';
    notifyBadgeCountChanged();
    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('badges-cleared').catch(console.error);
    }
  };

  if (btnClearStaged) {
    btnClearStaged.addEventListener('click', clearStagedContext);
  }

  // RAM Badge Click -> invoke trim_memory
  if (ramBadge) {
    ramBadge.addEventListener('click', async () => {
      if (ramBadgeText) ramBadgeText.textContent = 'Memory Shield: Trimming...';
      try {
        if (window.__TAURI__ && window.__TAURI__.core) {
          const report = await window.__TAURI__.core.invoke('trim_memory', { threshold_mb: 100 });
          const reclaimed = report.total_mb_reclaimed >= 1024 
            ? `${(report.total_mb_reclaimed / 1024).toFixed(2)} GB` 
            : `${report.total_mb_reclaimed.toFixed(1)} MB`;
          if (ramBadgeText) {
            ramBadgeText.textContent = `Memory Shield: ${reclaimed} reclaimed`;
          }
          appendMessage('assistant', `Memory Shield active: Reclaimed ${report.total_mb_reclaimed.toFixed(2)} MB across ${report.processes_trimmed} idle background processes. Active foreground process (PID ${report.foreground_pid_protected}) strictly protected.`);
        } else {
          if (ramBadgeText) ramBadgeText.textContent = 'Memory Shield: 3.1 GB reclaimed';
        }
      } catch (err) {
        console.error('Trim error:', err);
        if (ramBadgeText) ramBadgeText.textContent = 'Memory Shield: Trim failed';
      }
    });
  }

  // File Picker Manual Attachment
  if (btnAttachFile && filePicker) {
    btnAttachFile.addEventListener('click', () => filePicker.click());
    filePicker.addEventListener('change', () => {
      Array.from(filePicker.files).forEach((file) => {
        addStagedItem({
          type: 'file',
          name: file.name,
          path: file.name,
          meta: { size: file.size, mime: file.type },
        });
      });
      filePicker.value = '';
    });
  }

  // Voice Toggle Execution (Record Voice -> Whisper Transcription -> Composer Autofill)
  const toggleVoice = async () => {
    if (!isRecording) {
      isRecording = true;
      btnVoiceToggle.classList.add('recording');
      voiceIcon.textContent = '🔴';
      voiceLabel.textContent = 'Recording...';
      if (window.__TAURI__ && window.__TAURI__.core) {
        try {
          await window.__TAURI__.core.invoke('start_voice_recording');
        } catch (err) {
          console.error('Failed to start voice recording:', err);
          appendMessage('assistant', `Microphone capture failed: ${err}`);
          isRecording = false;
          btnVoiceToggle.classList.remove('recording');
          voiceIcon.textContent = '🎤';
          voiceLabel.textContent = 'Record Voice';
          return;
        }
      }
      appendMessage('assistant', 'Microphone active (16kHz mono audio stream). Speak your prompt or task description...');
    } else {
      isRecording = false;
      btnVoiceToggle.classList.remove('recording');
      voiceIcon.textContent = '🎤';
      voiceLabel.textContent = 'Transcribing...';
      if (window.__TAURI__ && window.__TAURI__.core) {
        try {
          const cfg = getEffectiveConfig();
          const result = await window.__TAURI__.core.invoke('stop_voice_recording', {
            transcribe: true,
            backendUrl: cfg.backendUrl,
            accessCode: cfg.accessCode,
          });
          voiceLabel.textContent = 'Record Voice';
          if (result && result.transcription && result.transcription.trim()) {
            const transcript = result.transcription.trim();
            const existing = composerInput.value.trim();
            composerInput.value = existing ? `${existing} ${transcript}` : transcript;
            appendMessage('assistant', `Transcribed: "${transcript}" (inserted into composer).`);
          } else if (result && result.error) {
            appendMessage('assistant', `Transcription error: ${result.error}`);
          } else {
            appendMessage('assistant', 'Audio recording saved (empty transcription).');
          }
        } catch (err) {
          console.error('Failed to stop recording:', err);
          voiceLabel.textContent = 'Record Voice';
          appendMessage('assistant', `Voice capture error: ${err}`);
        }
      } else {
        voiceLabel.textContent = 'Record Voice';
        appendMessage('assistant', 'Voice recording captured and staged for transcription (Whisper Turbo ready).', { audio: true });
      }
    }
  };

  if (btnVoiceToggle) {
    btnVoiceToggle.addEventListener('click', toggleVoice);
  }

  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const formatMarkdownInline = (text) => {
    // 1. Math inline: $...$
    let out = text.replace(/\$([^$\n]+)\$/g, '<span class="math-inline">$1</span>');
    // 2. Bold: **...**
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // 3. Italic: *...*
    out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // 4. Inline code: `...`
    out = out.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');
    return out;
  };

  const renderStructuredContent = (container, rawText) => {
    // 1. Tokenize code blocks: ```lang\ncode\n```
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    const renderTextBlock = (textBlock) => {
      if (!textBlock || !textBlock.trim()) return;

      const lines = textBlock.split('\n');
      let currentList = null;

      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const trimmed = rawLine.trim();

        if (!trimmed) {
          currentList = null;
          continue;
        }

        // Headings
        if (trimmed.startsWith('### ')) {
          currentList = null;
          const h3 = document.createElement('h3');
          h3.innerHTML = formatMarkdownInline(escapeHtml(trimmed.substring(4)));
          container.appendChild(h3);
        } else if (trimmed.startsWith('## ')) {
          currentList = null;
          const h2 = document.createElement('h2');
          h2.innerHTML = formatMarkdownInline(escapeHtml(trimmed.substring(3)));
          container.appendChild(h2);
        } else if (trimmed.startsWith('# ')) {
          currentList = null;
          const h1 = document.createElement('h1');
          h1.innerHTML = formatMarkdownInline(escapeHtml(trimmed.substring(2)));
          container.appendChild(h1);
        } else if (trimmed.startsWith('> ')) {
          // Blockquote
          currentList = null;
          const bq = document.createElement('blockquote');
          bq.innerHTML = formatMarkdownInline(escapeHtml(trimmed.substring(2)));
          container.appendChild(bq);
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          // Bullet list item
          if (!currentList) {
            currentList = document.createElement('ul');
            container.appendChild(currentList);
          }
          const li = document.createElement('li');
          li.innerHTML = formatMarkdownInline(escapeHtml(trimmed.substring(2)));
          currentList.appendChild(li);
        } else {
          // Regular paragraph
          currentList = null;
          const p = document.createElement('p');
          p.innerHTML = formatMarkdownInline(escapeHtml(trimmed));
          container.appendChild(p);
        }
      }
    };

    const renderTextSegment = (segment) => {
      if (!segment || !segment.trim()) return;

      // Check for LaTeX math blocks: $$...$$
      const mathBlockRegex = /\$\$([\s\S]+?)\$\$/g;
      let mathLastIdx = 0;
      let mathMatch;

      while ((mathMatch = mathBlockRegex.exec(segment)) !== null) {
        const textBeforeMath = segment.substring(mathLastIdx, mathMatch.index);
        renderTextBlock(textBeforeMath);

        const mathFormula = mathMatch[1].trim();
        const mathDiv = document.createElement('div');
        mathDiv.className = 'math-block';
        mathDiv.textContent = mathFormula;
        container.appendChild(mathDiv);

        mathLastIdx = mathMatch.index + mathMatch[0].length;
      }

      const textAfterMath = segment.substring(mathLastIdx);
      renderTextBlock(textAfterMath);
    };

    while ((match = codeBlockRegex.exec(rawText)) !== null) {
      const textBefore = rawText.substring(lastIndex, match.index);
      renderTextSegment(textBefore);

      const lang = match[1] || 'code';
      const codeText = match[2];

      const wrapper = document.createElement('div');
      wrapper.className = 'code-block-wrapper';
      wrapper.innerHTML = `
        <div class="code-block-header">
          <span class="code-lang">${escapeHtml(lang)}</span>
          <button class="btn-copy-code">Copy</button>
        </div>
        <pre class="code-content"><code>${escapeHtml(codeText)}</code></pre>
      `;

      const copyBtn = wrapper.querySelector('.btn-copy-code');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(codeText).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
        }).catch(err => console.error('Copy failed:', err));
      });

      container.appendChild(wrapper);
      lastIndex = match.index + match[0].length;
    }

    const remainingText = rawText.substring(lastIndex);
    renderTextSegment(remainingText);
  };

  // Helper to append message into #chat-feed with code blocks, copy buttons, TabPFN metrics, and audio bar
  const appendMessage = (role, content, options = {}) => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-message ${role}-message`;

    // TabPFN anomaly diagnostics summary card
    if (options.metrics) {
      const m = options.metrics;
      const metricsCard = document.createElement('div');
      metricsCard.className = 'tabular-metrics-card';
      metricsCard.style.cssText = 'background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 8px; padding: 10px 14px; margin-bottom: 10px; font-size: 0.85rem; color: #cbd5e1;';

      const outliers = m.outliers_detected !== undefined
        ? m.outliers_detected
        : (m.outlier_indices ? m.outlier_indices.length : 0);
      const rows = m.row_count || 0;
      const maxZ = m.max_z_score !== undefined ? Number(m.max_z_score).toFixed(2) : 'N/A';
      const mean = m.mean !== undefined ? Number(m.mean).toFixed(2) : 'N/A';
      const std = m.std_dev !== undefined ? Number(m.std_dev).toFixed(2) : 'N/A';

      metricsCard.innerHTML = `
        <div style="font-weight: 600; color: #60a5fa; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
          <span>📊</span><span>Prior Labs TabPFN Statistical Diagnostics</span>
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; font-size: 0.8rem;">
          <div><span style="color:#94a3b8">Rows:</span> <span style="font-weight:600; color:#f8fafc">${rows}</span></div>
          <div><span style="color:#94a3b8">Outliers:</span> <span style="font-weight:600; color:${outliers > 0 ? '#ef4444' : '#10b981'}">${outliers}</span></div>
          <div><span style="color:#94a3b8">Max Z-Score:</span> <span style="font-weight:600; color:#f8fafc">${maxZ}</span></div>
          <div><span style="color:#94a3b8">Mean / Std:</span> <span style="font-weight:600; color:#f8fafc">${mean} / ${std}</span></div>
        </div>
      `;
      msgDiv.appendChild(metricsCard);
    }

    // Staged badges summary inside user message card
    if (options.stagedSummary && options.stagedSummary.length > 0) {
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'msg-staged-summary';
      options.stagedSummary.forEach((item) => {
        const tag = document.createElement('span');
        tag.className = 'msg-staged-tag';
        tag.textContent = `${item.type === 'file' ? '📄' : item.type === 'snip' ? '✂️' : '📋'} ${item.name}`;
        summaryDiv.appendChild(tag);
      });
      msgDiv.appendChild(summaryDiv);
    }

    // Structured rendering of headings, bullet lists, math formulas, and code blocks
    renderStructuredContent(msgDiv, content);

    // ElevenLabs audio playback bar
    if (options.audio) {
      const textToSpeak = options.rawText || content;
      const audioBar = document.createElement('div');
      audioBar.className = 'audio-playback-bar';
      audioBar.innerHTML = `
        <button class="btn-audio-play" title="Play ElevenLabs Audio">▶</button>
        <div class="waveform-stub">
          <span class="waveform-bar" style="height: 35%"></span>
          <span class="waveform-bar" style="height: 70%"></span>
          <span class="waveform-bar" style="height: 100%"></span>
          <span class="waveform-bar" style="height: 55%"></span>
          <span class="waveform-bar" style="height: 85%"></span>
          <span class="waveform-bar" style="height: 40%"></span>
          <span class="waveform-bar" style="height: 65%"></span>
          <span class="waveform-bar" style="height: 25%"></span>
        </div>
        <span class="audio-duration">ElevenLabs TTS</span>
      `;

      const playBtn = audioBar.querySelector('.btn-audio-play');
      const durationSpan = audioBar.querySelector('.audio-duration');
      let audioObj = null;

      playBtn.addEventListener('click', async () => {
        if (audioObj && !audioObj.paused) {
          audioObj.pause();
          playBtn.textContent = '▶';
          audioBar.classList.remove('playing');
          return;
        }

        if (audioObj && audioObj.paused && audioObj.currentTime > 0) {
          audioObj.play().catch(console.error);
          playBtn.textContent = '⏸';
          audioBar.classList.add('playing');
          return;
        }

        playBtn.textContent = '⏳';
        durationSpan.textContent = 'Synthesizing...';

        if (window.__TAURI__ && window.__TAURI__.core) {
          try {
            const cfg = getEffectiveConfig();
            const bytes = await window.__TAURI__.core.invoke('synthesize_speech', {
              text: textToSpeak,
              backendUrl: cfg.backendUrl,
              accessCode: cfg.accessCode,
            });

            const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' });
            const url = URL.createObjectURL(blob);
            audioObj = new Audio(url);

            audioObj.addEventListener('play', () => {
              playBtn.textContent = '⏸';
              audioBar.classList.add('playing');
              durationSpan.textContent = 'Playing';
            });

            audioObj.addEventListener('pause', () => {
              playBtn.textContent = '▶';
              audioBar.classList.remove('playing');
            });

            audioObj.addEventListener('ended', () => {
              playBtn.textContent = '▶';
              audioBar.classList.remove('playing');
              durationSpan.textContent = 'Finished';
            });

            audioObj.addEventListener('loadedmetadata', () => {
              const mins = Math.floor(audioObj.duration / 60);
              const secs = Math.floor(audioObj.duration % 60).toString().padStart(2, '0');
              durationSpan.textContent = `${mins}:${secs}`;
            });

            await audioObj.play();
          } catch (err) {
            console.error('Speech synthesis error:', err);
            playBtn.textContent = '⚠️';
            durationSpan.textContent = 'TTS error';
          }
        } else {
          playBtn.textContent = '▶';
          durationSpan.textContent = 'Preview TTS';
        }
      });

      msgDiv.appendChild(audioBar);
    }

    chatFeed.appendChild(msgDiv);
    chatFeed.scrollTop = chatFeed.scrollHeight;
  };

  // Send Prompt Handler with Native Tauri Process Dispatching
  const sendPrompt = async () => {
    let text = composerInput.value.trim();
    if (!text && stagedItems.length === 0) return;

    const stagedSnapshot = [...stagedItems];
    let dataType = 'text';
    let filePath = null;

    // Inspect staged items to determine payload modality and primary file path
    for (const item of stagedSnapshot) {
      const p = (item.path || item.name || '').toLowerCase();
      if (
        item.type === 'snip' ||
        p.endsWith('.png') ||
        p.endsWith('.jpg') ||
        p.endsWith('.jpeg') ||
        p.endsWith('.webp') ||
        p.endsWith('.bmp') ||
        p.endsWith('.gif') ||
        p.endsWith('.svg')
      ) {
        dataType = 'image';
        filePath = item.path;
        break;
      } else if (p.endsWith('.csv') || p.endsWith('.tsv')) {
        dataType = 'tabular';
        filePath = item.path;
        break;
      } else if (item.path) {
        dataType = 'text';
        filePath = item.path;
      }
    }

    // Compound context: attach clipboard text or referenced URLs into prompt
    for (const item of stagedSnapshot) {
      const c = item.content || (item.meta && item.meta.content);
      if (item.type === 'clipboard' && c) {
        text = text ? `${text}\n\n[Clipboard Context]:\n${c}` : `[Clipboard Context]:\n${c}`;
      } else if (item.type === 'url') {
        text = text ? `${text}\n\n[Referenced URL]:\n${item.path || item.name}` : `[Referenced URL]:\n${item.path || item.name}`;
      }
    }

    appendMessage('user', text || `(Processing staged ${dataType} context)`, {
      stagedSummary: stagedSnapshot,
    });

    composerInput.value = '';
    stagedItems = [];
    renderStagedBadges();
    notifyBadgeCountChanged();
    if (window.__TAURI__ && window.__TAURI__.event) {
      window.__TAURI__.event.emit('badges-cleared').catch(console.error);
    }

    // Display clean loading indicator card with spinning loader
    const loadingCard = document.createElement('div');
    loadingCard.className = 'chat-message assistant-message loading-card';
    loadingCard.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="spinner-icon"></span>
        <span style="color:#cbd5e1; font-weight:500;">Analyzing...</span>
      </div>
    `;
    chatFeed.appendChild(loadingCard);
    chatFeed.scrollTop = chatFeed.scrollHeight;

    // Collect all attached file paths
    const filePaths = [];
    for (const item of stagedSnapshot) {
      if (item.path) {
        filePaths.push(item.path);
      }
    }

    if (window.__TAURI__ && window.__TAURI__.core) {
      try {
        const cfg = getEffectiveConfig();
        const response = await window.__TAURI__.core.invoke('send_process_payload', {
          prompt: text,
          dataType: dataType,
          filePath: filePath,
          filePaths: filePaths,
          backendUrl: cfg.backendUrl,
          accessCode: cfg.accessCode,
        });

        if (loadingCard.parentNode) {
          loadingCard.parentNode.removeChild(loadingCard);
        }

        const answer = response.answer || JSON.stringify(response, null, 2);
        appendMessage('assistant', answer, {
          audio: true,
          rawText: answer,
          metrics: response.type === 'tabular_solution' ? response.metrics : null,
        });
      } catch (err) {
        console.error('send_process_payload failed:', err);
        if (loadingCard.parentNode) {
          loadingCard.parentNode.removeChild(loadingCard);
        }
        appendMessage('assistant', `⚠️ Processing error: ${err}`);
      }
    } else {
      setTimeout(() => {
        if (loadingCard.parentNode) {
          loadingCard.parentNode.removeChild(loadingCard);
        }
        const reply = `Received ${stagedSnapshot.length} context items. Analysis queued for Gemma 4 pipeline:\n\n\`\`\`json\n{\n  "status": "ready",\n  "staged_count": ${stagedSnapshot.length},\n  "query": "${text}"\n}\n\`\`\``;
        appendMessage('assistant', reply, { audio: true, rawText: reply });
      }, 350);
    }
  };

  if (btnSendPrompt) {
    btnSendPrompt.addEventListener('click', sendPrompt);
  }

  composerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });

  // Cross-Window Event Listeners
  if (window.__TAURI__ && window.__TAURI__.event) {
    // 1. Files dropped on DropBox pill (Window 1 -> Window 2, Silent Accumulator)
    window.__TAURI__.event.listen('stage-files', (event) => {
      const paths = event.payload && event.payload.paths ? event.payload.paths : [];
      const isUrl = event.payload && event.payload.isUrl;
      const isImage = event.payload && event.payload.isImage;
      paths.forEach((filePath) => {
        const fileName = filePath.replace(/^.*[\\\/]/, '');
        const lower = filePath.toLowerCase();
        const isImg = isImage || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.bmp') || lower.endsWith('.gif') || lower.endsWith('.svg');
        addStagedItem({
          type: isImg ? 'image' : (isUrl ? 'url' : 'file'),
          name: fileName,
          path: filePath,
        });
      });
      // HUD is not auto-summoned; staged items accumulate silently
    });

    // 2. Browser text drag-and-drop from Chrome / Edge
    window.__TAURI__.event.listen('stage-text', (event) => {
      const text = event.payload && event.payload.text ? event.payload.text : '';
      if (text) {
        const trimmed = text.trim();
        const preview = getFirstFewWords(trimmed);
        addStagedItem({
          type: 'clipboard',
          name: `"${preview}"`,
          path: null,
          content: trimmed,
          meta: { length: trimmed.length, content: trimmed },
        });
      }
    });

    // 3. Snip captured from Screen Snipper (Window 3 -> Window 2)
    window.__TAURI__.event.listen('snip-captured', (event) => {
      const { filePath, width, height } = event.payload || {};
      const fileName = filePath ? filePath.replace(/^.*[\\\/]/, '') : 'screenshot.png';
      addStagedItem({
        type: 'snip',
        name: `Snip (${width || 0}×${height || 0})`,
        path: filePath,
        meta: { width, height },
      });
    });

    // 4. Alt+Shift+1 Clipboard Ingest (Native Win32 IPC + Event payload)
    window.__TAURI__.event.listen('trigger-clipboard-ingest', async (event) => {
      try {
        let text = (event.payload && typeof event.payload.text === 'string') ? event.payload.text : null;
        if (!text) {
          if (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke) {
            text = await window.__TAURI__.core.invoke('get_clipboard_text');
          } else if (window.__TAURI__ && window.__TAURI__.invoke) {
            text = await window.__TAURI__.invoke('get_clipboard_text');
          } else if (navigator.clipboard && navigator.clipboard.readText) {
            text = await navigator.clipboard.readText();
          }
        }

        if (text && text.trim()) {
          const trimmed = text.trim();
          const preview = getFirstFewWords(trimmed);
          addStagedItem({
            type: 'clipboard',
            name: `"${preview}"`,
            path: null,
            content: trimmed,
            meta: { length: trimmed.length, content: trimmed },
          });
        } else {
          addStagedItem({
            type: 'clipboard',
            name: 'Empty Clipboard',
            path: null,
            content: '(Clipboard is empty)',
            meta: { length: 0 },
          });
        }
      } catch (err) {
        console.warn('Native clipboard retrieval fallback:', err);
        addStagedItem({
          type: 'clipboard',
          name: 'Clipboard staged',
          path: null,
          content: 'Clipboard text was staged',
        });
      }
    });

    // 4. Alt+Shift+V Voice Toggle
    window.__TAURI__.event.listen('trigger-voice-toggle', () => {
      toggleVoice();
    });

    // 5. Memory trim event
    window.__TAURI__.event.listen('memory-trimmed', (event) => {
      const report = event.payload;
      if (report && ramBadgeText) {
        const reclaimed = report.total_mb_reclaimed >= 1024
          ? `${(report.total_mb_reclaimed / 1024).toFixed(2)} GB`
          : `${report.total_mb_reclaimed.toFixed(1)} MB`;
        ramBadgeText.textContent = `Memory Shield: ${reclaimed} reclaimed`;
      }
    });
  }

  // Initial render
  renderStagedBadges();
});

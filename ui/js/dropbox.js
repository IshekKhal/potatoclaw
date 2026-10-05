document.addEventListener('DOMContentLoaded', () => {
  const pill = document.getElementById('dropboxPill');
  const badge = document.getElementById('dropBadge');
  const contextMenu = document.getElementById('contextMenu');
  const menuOpenHud = document.getElementById('menuOpenHud');
  const menuTrimRam = document.getElementById('menuTrimRam');
  const menuHidePill = document.getElementById('menuHidePill');

  let stagedCount = 0;
  let isDraggingPill = false;
  let clickStartTime = 0;

  const tauri = window.__TAURI__;

  // Helper to safely invoke Tauri commands
  const invoke = (cmd, args = {}) => {
    if (tauri && tauri.core && tauri.core.invoke) {
      return tauri.core.invoke(cmd, args);
    }
    return Promise.reject(new Error('Tauri IPC core not available'));
  };

  // Helper to emit global Tauri events
  const emit = (event, payload) => {
    if (tauri && tauri.event && tauri.event.emit) {
      return tauri.event.emit(event, payload);
    }
    return Promise.reject(new Error('Tauri event bus not available'));
  };

  // Helper to update badge
  const updateBadge = (count) => {
    stagedCount = count;
    if (stagedCount > 0) {
      badge.textContent = stagedCount > 99 ? '99+' : stagedCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  };

  // Track mousedown to differentiate drag vs click
  pill.addEventListener('mousedown', () => {
    clickStartTime = Date.now();
    isDraggingPill = false;
  });

  pill.addEventListener('mousemove', () => {
    if (Date.now() - clickStartTime > 120) {
      isDraggingPill = true;
    }
  });

  let clickTimer = null;
  const CLICK_DELAY_MS = 220;

  const triggerMemoryTrim = async () => {
    pill.classList.add('trimming');
    setTimeout(() => {
      pill.classList.remove('trimming');
    }, 800);

    try {
      const report = await invoke('trim_memory', { threshold_mb: 100 });
      console.log('RAM Trimmed from DropBox pill:', report);
      emit('memory-trimmed', report).catch(console.error);
    } catch (err) {
      console.error('Failed to trim RAM from pill:', err);
    }
  };

  const triggerHudToggle = () => {
    closeContextMenu();
    invoke('toggle_window', { label: 'hud' }).catch(err => {
      console.error('Failed to toggle HUD:', err);
    });
  };

  // Left click & double click disambiguation
  pill.addEventListener('click', (e) => {
    if (e.button !== 0 || isDraggingPill) return;

    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
      triggerMemoryTrim();
    } else {
      clickTimer = setTimeout(() => {
        clickTimer = null;
        triggerHudToggle();
      }, CLICK_DELAY_MS);
    }
  });

  pill.addEventListener('dblclick', (e) => {
    if (e.button !== 0) return;
    if (clickTimer) {
      clearTimeout(clickTimer);
      clickTimer = null;
    }
    triggerMemoryTrim();
  });

  // Right-click: Context Menu
  pill.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Position menu within window bounds
    contextMenu.style.top = '10px';
    contextMenu.style.left = '10px';
    contextMenu.classList.add('visible');
  });

  const closeContextMenu = () => {
    contextMenu.classList.remove('visible');
  };

  // Close context menu on outside click
  window.addEventListener('click', (e) => {
    if (!contextMenu.contains(e.target) && e.target !== pill) {
      closeContextMenu();
    }
  });

  // Context Menu Actions
  menuOpenHud.addEventListener('click', () => {
    closeContextMenu();
    invoke('show_window', { label: 'hud' }).catch(console.error);
  });

  menuTrimRam.addEventListener('click', async () => {
    closeContextMenu();
    await triggerMemoryTrim();
  });

  menuHidePill.addEventListener('click', () => {
    closeContextMenu();
    invoke('hide_window', { label: 'dropbox' }).catch(console.error);
  });

  // Handle Drag-and-Drop Ingestion (Silent Accumulator)
  const handleDroppedPaths = (paths) => {
    if (!paths || paths.length === 0) return;
    console.log('Files dropped into DropBox pill:', paths);

    pill.classList.remove('drag-over');
    updateBadge(stagedCount + paths.length);

    // Emit stage-files event to global event bus. HUD remains closed until explicitly opened.
    emit('stage-files', { paths }).catch(console.error);
  };

  // 1. Unified native Tauri v2 onDragDropEvent via WebviewWindow
  if (tauri && tauri.webviewWindow && tauri.webviewWindow.getCurrentWebviewWindow) {
    try {
      const currentWebview = tauri.webviewWindow.getCurrentWebviewWindow();
      currentWebview.onDragDropEvent((event) => {
        const payload = event.payload;
        if (!payload) return;

        if (payload.type === 'enter' || payload.type === 'over') {
          pill.classList.add('drag-over');
        } else if (payload.type === 'leave') {
          pill.classList.remove('drag-over');
        } else if (payload.type === 'drop') {
          pill.classList.remove('drag-over');
          handleDroppedPaths(payload.paths || []);
        }
      }).catch(err => {
        console.warn('onDragDropEvent registration failed:', err);
      });
    } catch (err) {
      console.warn('getCurrentWebviewWindow error:', err);
    }
  }

  // 2. Global event listeners for synchronized badge count
  if (tauri && tauri.event && tauri.event.listen) {
    tauri.event.listen('staged-count-changed', (event) => {
      const count = (event.payload && typeof event.payload.count === 'number') ? event.payload.count : 0;
      updateBadge(count);
    });

    tauri.event.listen('badges-cleared', () => {
      updateBadge(0);
    });
  }

  // 3. HTML5 Drag and Drop with full browser support (Chrome, Edge, Firefox)
  const onDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    pill.classList.add('drag-over');
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    pill.classList.remove('drag-over');
  };

  // Universal Drag-and-Drop Payload Extractor for Windows Explorer, VS Code, and Web Browsers
  const extractDropPayload = (dt) => {
    // 1. Native OS files with absolute path (e.g. from Windows Explorer)
    if (dt.files && dt.files.length > 0) {
      const validPaths = [];
      for (let i = 0; i < dt.files.length; i++) {
        const f = dt.files[i];
        if (f.path && (f.path.includes(':\\') || f.path.startsWith('/') || f.path.startsWith('\\\\'))) {
          validPaths.push(f.path);
        }
      }
      if (validPaths.length > 0) {
        return { type: 'paths', paths: validPaths };
      }
    }

    // 2. URI-List (dragged from VS Code tabs or browser URLs)
    const uriList = dt.getData('text/uri-list');
    if (uriList && uriList.trim()) {
      const lines = uriList.split(/[\r\n]+/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
      const localPaths = [];
      const webUrls = [];
      for (const u of lines) {
        if (u.startsWith('file:///')) {
          let clean = decodeURIComponent(u.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
          localPaths.push(clean);
        } else if (u.startsWith('http://') || u.startsWith('https://')) {
          webUrls.push(u);
        }
      }
      if (localPaths.length > 0) {
        return { type: 'paths', paths: localPaths };
      }
      if (webUrls.length > 0) {
        return { type: 'urls', urls: webUrls };
      }
    }

    // 3. HTML snippet (dragged web images or rich links from Chrome / Edge)
    const html = dt.getData('text/html');
    if (html) {
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        let src = imgMatch[1].replace(/&amp;/g, '&');
        if (src.startsWith('file:///')) {
          let clean = decodeURIComponent(src.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
          return { type: 'paths', paths: [clean] };
        }
        return { type: 'image_url', url: src };
      }
      const aMatch = html.match(/<a[^>]+href=["']([^"']+)["']/i);
      if (aMatch && aMatch[1]) {
        let href = aMatch[1].replace(/&amp;/g, '&');
        if (href.startsWith('file:///')) {
          let clean = decodeURIComponent(href.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
          return { type: 'paths', paths: [clean] };
        }
        return { type: 'urls', urls: [href] };
      }
    }

    // 4. Plain text (dragged code selection, VS Code tab text, or Windows path string)
    const plainText = dt.getData('text/plain');
    if (plainText && plainText.trim()) {
      const trimmed = plainText.trim();
      if (trimmed.startsWith('file:///')) {
        let clean = decodeURIComponent(trimmed.replace(/^file:\/\/\//, '')).replace(/\//g, '\\');
        return { type: 'paths', paths: [clean] };
      }
      const unquoted = trimmed.replace(/^["']|["']$/g, '');
      if (/^[a-zA-Z]:\\/.test(unquoted) || unquoted.startsWith('\\\\')) {
        return { type: 'paths', paths: [unquoted] };
      }
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return { type: 'urls', urls: [trimmed] };
      }
      return { type: 'text', text: trimmed };
    }

    return null;
  };

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    pill.classList.remove('drag-over');

    const dt = e.dataTransfer;
    if (!dt) return;

    const payload = extractDropPayload(dt);
    if (!payload) return;

    if (payload.type === 'paths') {
      handleDroppedPaths(payload.paths);
    } else if (payload.type === 'image_url') {
      emit('stage-files', { paths: [payload.url], isUrl: true, isImage: true }).catch(console.error);
      updateBadge(stagedCount + 1);
    } else if (payload.type === 'urls') {
      emit('stage-files', { paths: payload.urls, isUrl: true }).catch(console.error);
      updateBadge(stagedCount + payload.urls.length);
    } else if (payload.type === 'text') {
      emit('stage-text', { text: payload.text }).catch(console.error);
      updateBadge(stagedCount + 1);
    }
  };

  // Attach drag listeners to both window and pill to ensure 100% capture across entire viewport
  ['dragenter', 'dragover'].forEach((type) => {
    window.addEventListener(type, onDragOver, false);
    pill.addEventListener(type, onDragOver, false);
  });

  ['dragleave', 'dragend'].forEach((type) => {
    window.addEventListener(type, onDragLeave, false);
    pill.addEventListener(type, onDragLeave, false);
  });

  window.addEventListener('drop', onDrop, false);
  pill.addEventListener('drop', onDrop, false);
});

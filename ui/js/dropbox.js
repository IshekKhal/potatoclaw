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

  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    pill.classList.remove('drag-over');

    const dt = e.dataTransfer;
    if (!dt) return;

    // A. Check for local OS files
    const files = dt.files;
    if (files && files.length > 0) {
      const paths = [];
      for (let i = 0; i < files.length; i++) {
        const p = files[i].path || files[i].name;
        if (p) paths.push(p);
      }
      if (paths.length > 0) {
        handleDroppedPaths(paths);
        return;
      }
    }

    // B. Check for HTML snippet (Chrome/Edge drags for images & rich links)
    const html = dt.getData('text/html');
    if (html) {
      const imgMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch && imgMatch[1]) {
        let src = imgMatch[1].replace(/&amp;/g, '&');
        emit('stage-files', { paths: [src], isUrl: true, isImage: true }).catch(console.error);
        updateBadge(stagedCount + 1);
        return;
      }
      const aMatch = html.match(/<a[^>]+href=["']([^"']+)["']/i);
      if (aMatch && aMatch[1]) {
        let href = aMatch[1].replace(/&amp;/g, '&');
        emit('stage-files', { paths: [href], isUrl: true }).catch(console.error);
        updateBadge(stagedCount + 1);
        return;
      }
    }

    // C. Check for URI-List (dragged URL links)
    const uriList = dt.getData('text/uri-list');
    if (uriList && uriList.trim()) {
      const urls = uriList.split('\n').map(u => u.trim()).filter(u => u && !u.startsWith('#'));
      if (urls.length > 0) {
        emit('stage-files', { paths: urls, isUrl: true }).catch(console.error);
        updateBadge(stagedCount + urls.length);
        return;
      }
    }

    // D. Check for plain text (dragged text selection or direct URL)
    const plainText = dt.getData('text/plain');
    if (plainText && plainText.trim()) {
      const text = plainText.trim();
      if (text.startsWith('http://') || text.startsWith('https://')) {
        emit('stage-files', { paths: [text], isUrl: true }).catch(console.error);
        updateBadge(stagedCount + 1);
      } else {
        emit('stage-text', { text }).catch(console.error);
        updateBadge(stagedCount + 1);
      }
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

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

  // Left click: Toggle HUD
  pill.addEventListener('click', (e) => {
    if (e.button !== 0 || isDraggingPill) return;
    closeContextMenu();
    invoke('toggle_window', { label: 'hud' }).catch(err => {
      console.error('Failed to toggle HUD:', err);
    });
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
    try {
      const report = await invoke('trim_memory', { threshold_mb: 100 });
      console.log('RAM Trimmed from DropBox pill:', report);
      emit('memory-trimmed', report).catch(console.error);
    } catch (err) {
      console.error('Failed to trim RAM:', err);
    }
  });

  menuHidePill.addEventListener('click', () => {
    closeContextMenu();
    invoke('hide_window', { label: 'dropbox' }).catch(console.error);
  });

  // Handle Drag-and-Drop Ingestion
  const handleDroppedPaths = (paths) => {
    if (!paths || paths.length === 0) return;
    console.log('Files dropped into DropBox pill:', paths);

    pill.classList.remove('drag-over');
    updateBadge(stagedCount + paths.length);

    // Emit stage-files event to global event bus
    emit('stage-files', { paths }).catch(console.error);

    // Bring HUD to view and focus
    invoke('show_window', { label: 'hud' }).catch(console.error);
  };

  // 1. Native Tauri v2 onDragDropEvent via WebviewWindow
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
        console.warn('onDragDropEvent registration failed, falling back to event listeners:', err);
      });
    } catch (err) {
      console.warn('getCurrentWebviewWindow error:', err);
    }
  }

  // 2. Fallback event listeners for tauri://drag-drop
  if (tauri && tauri.event && tauri.event.listen) {
    tauri.event.listen('tauri://drag-enter', () => {
      pill.classList.add('drag-over');
    });

    tauri.event.listen('tauri://drag-leave', () => {
      pill.classList.remove('drag-over');
    });

    tauri.event.listen('tauri://drag-drop', (event) => {
      pill.classList.remove('drag-over');
      const payload = event.payload;
      const paths = (payload && payload.paths) ? payload.paths : (Array.isArray(payload) ? payload : []);
      handleDroppedPaths(paths);
    });

    // Reset staged count if HUD clears badges
    tauri.event.listen('badges-cleared', () => {
      updateBadge(0);
    });
  }

  // 3. HTML5 Drag and Drop fallback
  pill.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pill.classList.add('drag-over');
  });

  pill.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pill.classList.remove('drag-over');
  });

  pill.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pill.classList.remove('drag-over');

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const paths = [];
      for (let i = 0; i < files.length; i++) {
        // In electron/webview environments, file.path exists
        paths.push(files[i].path || files[i].name);
      }
      handleDroppedPaths(paths);
    }
  });
});

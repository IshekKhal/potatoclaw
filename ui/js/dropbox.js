document.addEventListener('DOMContentLoaded', () => {
  const pill = document.getElementById('dropboxPill');
  const badge = document.getElementById('dropBadge');
  let stagedCount = 0;

  // Click pill to toggle HUD window visibility
  pill.addEventListener('click', (e) => {
    // Only toggle if not dragged
    if (window.__TAURI__ && window.__TAURI__.core) {
      window.__TAURI__.core.invoke('toggle_window', { label: 'hud' })
        .catch(err => console.error('Failed to toggle HUD:', err));
    }
  });

  // Drag and drop events for file ingestion
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
      stagedCount += files.length;
      badge.textContent = stagedCount;
      badge.style.display = 'flex';

      // Open HUD to display dropped items
      if (window.__TAURI__ && window.__TAURI__.core) {
        window.__TAURI__.core.invoke('show_window', { label: 'hud' })
          .catch(err => console.error('Failed to show HUD:', err));
      }
    }
  });
});

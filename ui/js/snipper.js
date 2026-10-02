document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('snipperOverlay');
  const selectionBox = document.getElementById('selectionBox');

  let isDragging = false;
  let startX = 0;
  let startY = 0;

  const hideSnipper = () => {
    isDragging = false;
    selectionBox.style.display = 'none';
    if (window.__TAURI__ && window.__TAURI__.core) {
      window.__TAURI__.core.invoke('hide_window', { label: 'snipper' })
        .catch(err => console.error('Failed to hide snipper:', err));
    }
  };

  // Esc key cancels snip
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideSnipper();
    }
  });

  overlay.addEventListener('mousedown', (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    selectionBox.style.left = `${left}px`;
    selectionBox.style.top = `${top}px`;
    selectionBox.style.width = `${width}px`;
    selectionBox.style.height = `${height}px`;
  });

  overlay.addEventListener('mouseup', (e) => {
    if (!isDragging) return;
    isDragging = false;

    const width = parseInt(selectionBox.style.width, 10) || 0;
    const height = parseInt(selectionBox.style.height, 10) || 0;

    // Minimum region check
    if (width > 20 && height > 20) {
      // Completed snip: Hide snipper and reveal HUD
      hideSnipper();
      if (window.__TAURI__ && window.__TAURI__.core) {
        window.__TAURI__.core.invoke('show_window', { label: 'hud' })
          .catch(err => console.error('Failed to show HUD after snip:', err));
      }
    } else {
      selectionBox.style.display = 'none';
    }
  });
});

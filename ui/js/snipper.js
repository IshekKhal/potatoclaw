document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('snipperOverlay');
  const selectionBox = document.getElementById('selectionBox');
  const dimBadge = document.getElementById('dimBadge');

  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let currentLeft = 0;
  let currentTop = 0;
  let currentWidth = 0;
  let currentHeight = 0;

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
    // Only capture primary mouse button
    if (e.button !== 0) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    currentLeft = startX;
    currentTop = startY;
    currentWidth = 0;
    currentHeight = 0;

    selectionBox.style.left = `${startX}px`;
    selectionBox.style.top = `${startY}px`;
    selectionBox.style.width = '0px';
    selectionBox.style.height = '0px';
    selectionBox.style.display = 'block';
    if (dimBadge) {
      dimBadge.textContent = '0 × 0 px';
    }
  });

  overlay.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const currentX = e.clientX;
    const currentY = e.clientY;

    currentLeft = Math.min(startX, currentX);
    currentTop = Math.min(startY, currentY);
    currentWidth = Math.abs(currentX - startX);
    currentHeight = Math.abs(currentY - startY);

    selectionBox.style.left = `${currentLeft}px`;
    selectionBox.style.top = `${currentTop}px`;
    selectionBox.style.width = `${currentWidth}px`;
    selectionBox.style.height = `${currentHeight}px`;

    if (dimBadge) {
      dimBadge.textContent = `${currentWidth} × ${currentHeight} px`;
    }
  });

  overlay.addEventListener('mouseup', async (e) => {
    if (!isDragging) return;
    isDragging = false;

    // Minimum region threshold: 15x15px to avoid accidental clicks
    if (currentWidth >= 15 && currentHeight >= 15) {
      const dpr = window.devicePixelRatio || 1;
      const physX = Math.round(currentLeft * dpr);
      const physY = Math.round(currentTop * dpr);
      const physW = Math.round(currentWidth * dpr);
      const physH = Math.round(currentHeight * dpr);

      selectionBox.style.display = 'none';

      if (window.__TAURI__ && window.__TAURI__.core) {
        try {
          const filePath = await window.__TAURI__.core.invoke('capture_screen_region', {
            x: physX,
            y: physY,
            width: physW,
            height: physH,
          });

          // Broadcast captured event across windows
          if (window.__TAURI__.event) {
            await window.__TAURI__.event.emit('snip-captured', {
              filePath,
              width: physW,
              height: physH,
              timestamp: Date.now(),
            });
          }

          // Hide snipper overlay and bring HUD into focus
          hideSnipper();
          await window.__TAURI__.core.invoke('show_window', { label: 'hud' });
        } catch (err) {
          console.error('Failed to capture screen region:', err);
          hideSnipper();
        }
      } else {
        // Fallback for non-Tauri preview environments
        console.log(`Mock snip captured: (${physX}, ${physY}, ${physW}x${physH})`);
        hideSnipper();
      }
    } else {
      selectionBox.style.display = 'none';
    }
  });
});

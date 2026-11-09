// Keep rapid taps at a fixed scale, including older mobile WebViews.
(() => {
    document.addEventListener('dblclick', event => event.preventDefault(), { passive: false });
    let start = null, previous = null;
    document.addEventListener('touchstart', event => {
        if (event.touches.length !== 1) { start = null; previous = null; return; }
        const touch = event.touches[0];
        start = { x: touch.clientX, y: touch.clientY };
    }, { passive: true });
    document.addEventListener('touchend', event => {
        if (!start || event.touches.length || !event.changedTouches.length) return;
        const touch = event.changedTouches[0], now = performance.now();
        const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 10;
        start = null;
        if (moved) { previous = null; return; }
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('input, textarea, select')) { previous = null; return; }
        const doubleTap = previous && now - previous.time < 350 &&
            Math.hypot(touch.clientX - previous.x, touch.clientY - previous.y) < 35;
        previous = { time: now, x: touch.clientX, y: touch.clientY };
        if (!doubleTap || !event.cancelable) return;
        event.preventDefault();
        // Cats already act on pointerdown. Preserve the second tap on ordinary controls.
        if (!target?.closest('#game-board')) target?.closest('button, a, label')?.click();
    }, { passive: false });
    document.addEventListener('touchcancel', () => { start = null; previous = null; }, { passive: true });
})();

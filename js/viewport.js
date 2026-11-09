// Fit the actual visible page, including expanded/collapsed mobile browser controls.
(() => {
    let frame;
    const update = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            const viewport = window.visualViewport;
            // Ignore transient pinch zoom geometry; the game already guards double taps.
            if (viewport && Math.abs(viewport.scale - 1) > .05) return;
            const height = viewport?.height || window.innerHeight;
            if (height > 0) document.documentElement.style.setProperty('--app-viewport-height', `${height}px`);
            window.game?.homeScene?.requestLayout();
        });
    };
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    window.addEventListener('pageshow', update, { passive: true });
    window.visualViewport?.addEventListener('resize', update, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) update(); });
    update();
})();

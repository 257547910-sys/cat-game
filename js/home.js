// Independent title artwork; it never changes the board or either saved run.
class HomeScene {
    constructor(game) {
        this.game = game;
        this.root = document.getElementById('title-screen');
        this.cats = document.getElementById('title-cats');
        this.surface = this.root.querySelector('.home-cat-surface');
        this.menu = this.root.querySelector('.title-btns');
        this.lastMeow = -Infinity;
        this.active = false;
        this.cats.addEventListener('click', event => {
            const cat = event.target.closest('.home-cat');
            if (!cat || !this.canInteract()) return;
            cat.classList.add('petted');
            const img = cat.querySelector('img');
            const color = this.game.board.colors[Number(cat.dataset.color)];
            img.src = color.normal;
            this.meow(true);
            clearTimeout(this.petTimer);
            this.petTimer = setTimeout(() => {
                this.cats.querySelectorAll('.petted').forEach(node => node.classList.remove('petted'));
                this.restoreFaces();
            }, 650);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.pause();
            else if (!this.root.classList.contains('hidden')) this.start();
        });
        if (window.ResizeObserver) {
            this.observer = new ResizeObserver(() => this.requestLayout());
            this.observer.observe(this.root);
            this.observer.observe(this.menu);
        } else window.addEventListener('resize', () => this.requestLayout());
    }

    renderCats() {
        const poses = [
            { color: 4, x: 21, y: 46, size: 119, tilt: -5 },
            { color: 0, x: 126, y: 0, size: 133, tilt: 2, asleep: true },
            { color: 3, x: 256, y: 47, size: 120, tilt: 5 },
            { color: 1, x: 69, y: 123, size: 127, tilt: -3 },
            { color: 2, x: 191, y: 125, size: 130, tilt: 3 }
        ];
        const fragment = document.createDocumentFragment();
        poses.forEach((pose, index) => {
            const cat = document.createElement('button');
            cat.type = 'button';
            cat.className = 'home-cat';
            cat.dataset.color = pose.color;
            cat.dataset.asleep = pose.asleep ? 'true' : 'false';
            cat.setAttribute('aria-label', `摸摸第 ${index + 1} 只猫咪`);
            cat.style.cssText = `left:${pose.x}px;top:${pose.y}px;width:${pose.size}px;height:${pose.size}px;--tilt:${pose.tilt}deg;--breath-delay:${-index * .63}s;z-index:${index < 3 ? 1 : 3}`;
            const img = document.createElement('img');
            const color = this.game.board.colors[pose.color];
            img.src = pose.asleep ? color.blink : color.normal;
            img.alt = '';
            img.draggable = false;
            cat.appendChild(img);
            fragment.appendChild(cat);
            // Decode the alternate face before its first blink.
            const preload = new Image();
            preload.src = pose.asleep ? color.normal : color.blink;
        });
        this.cats.replaceChildren(fragment);
        this.requestLayout();
    }

    canInteract() {
        return this.active && !document.hidden && !this.root.classList.contains('hidden') &&
            !document.querySelector('.modal-overlay:not(.hidden)');
    }

    meow(touched = false) {
        if (!this.canInteract() || !window.sounds.canPlaySfx()) return;
        if (window.sounds.ctx?.state !== 'running') {
            // The first touch may still be unlocking audio when the click arrives.
            if (touched) {
                window.sounds.recoverAudio(true);
                const ctx = window.sounds.ctx;
                try {
                    if (ctx) Promise.resolve(ctx.resume()).then(() => {
                        if (window.sounds.ctx === ctx && ctx.state === 'running') this.meow(true);
                    }).catch(() => {});
                } catch (e) {}
            }
            return;
        }
        const now = performance.now();
        if (now - this.lastMeow < (touched ? 1000 : 10000)) return;
        this.lastMeow = now;
        window.sounds.playCatMeow(touched ? 'kitten' : 'curious');
    }

    restoreFaces() {
        this.cats.querySelectorAll('.home-cat').forEach(cat => {
            const color = this.game.board.colors[Number(cat.dataset.color)];
            cat.querySelector('img').src = cat.dataset.asleep === 'true' ? color.blink : color.normal;
        });
    }

    scheduleBlink() {
        this.blinkTimer = setTimeout(() => {
            if (!this.active || document.hidden) return;
            if (this.canInteract()) {
                const cats = [...this.cats.querySelectorAll('.home-cat:not(.petted)')];
                const cat = cats[Math.floor(Math.random() * cats.length)];
                if (cat) {
                    const color = this.game.board.colors[Number(cat.dataset.color)];
                    cat.querySelector('img').src = cat.dataset.asleep === 'true' ? color.normal : color.blink;
                    this.faceTimer = setTimeout(() => this.restoreFaces(), 190);
                }
            }
            this.scheduleBlink();
        }, 2200 + Math.random() * 2400);
    }

    scheduleMeow() {
        this.meowTimer = setTimeout(() => {
            if (!this.active || document.hidden) return;
            this.meow();
            this.scheduleMeow();
        }, 14000 + Math.random() * 10000);
    }

    start() {
        this.root.closest('#game-app').classList.add('home-visible');
        this.requestLayout();
        if (this.active || document.hidden) return;
        this.active = true;
        this.scheduleBlink();
        this.scheduleMeow();
    }

    pause() {
        this.active = false;
        clearTimeout(this.blinkTimer);
        clearTimeout(this.meowTimer);
        clearTimeout(this.faceTimer);
        clearTimeout(this.petTimer);
        this.cats.querySelectorAll('.petted').forEach(cat => cat.classList.remove('petted'));
        this.restoreFaces();
    }

    stop() {
        this.pause();
        this.root.closest('#game-app').classList.remove('home-visible');
    }

    requestLayout() {
        cancelAnimationFrame(this.layoutFrame);
        this.layoutFrame = requestAnimationFrame(() => {
            if (this.root.classList.contains('hidden')) return;
            const width = this.root.clientWidth, height = this.root.clientHeight;
            if (!width || !height) return;
            const scale = Math.min(width / 390, height / 844);
            this.root.style.setProperty('--home-scale', scale);
            const rootRect = this.root.getBoundingClientRect();
            const menuBottom = this.menu.getBoundingClientRect().bottom - rootRect.top;
            const bottom = Math.max(18, height * .044);
            const available = Math.max(100, height - bottom - menuBottom - 22);
            const catScale = Math.min(width / 390, available / 255);
            this.surface.style.setProperty('--cat-scale', catScale);
            this.surface.style.bottom = `${bottom}px`;
        });
    }
}
window.HomeScene = HomeScene;

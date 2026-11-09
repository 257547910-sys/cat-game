// 环境效果：水面涟漪与波光、海鸥、四季粒子、过关彩带、季节切换
class EffectsManager {
    constructor(game) {
        this.game = game;
        this.themes = ['summer', 'spring', 'autumn', 'winter'];
        this.names = { summer: '盛夏', spring: '暖春', autumn: '金秋', winter: '凛冬' };
        this.waterLayer = document.getElementById('water-layer');
        this.partLayer = document.getElementById('particle-layer');
        this.gullLayer = document.getElementById('seagull-layer');

        this.setTheme(this.game.state.theme || 'summer', false);
        document.getElementById('btn-season-switch').addEventListener('click', () => {
            const i = this.themes.indexOf(this.game.state.theme);
            this.setTheme(this.themes[(i + 1) % 4], true);
        });

        this.loopRipple();
        this.loopGlint();
        this.loopGull();
        setInterval(() => this.spawnParticle(), 650);
    }

    setTheme(name, notify) {
        if (!this.themes.includes(name)) name = 'summer';
        this.game.state.theme = name;
        document.getElementById('bg-image').src = `assets/images/backgrounds/${name}.jpg`;
        this.partLayer.innerHTML = '';
        if (notify) {
            this.game.saveState();
            this.game.propsManager.showToast(`${this.names[name]}`);
        }
    }

    // 水面不定时荡开涟漪（泳池区域大致在画面中部）
    loopRipple() {
        const go = () => {
            if (document.hidden || this.game.board.isAnimating) { setTimeout(go, 2500); return; }
            const ring = document.createElement('div');
            ring.className = 'ripple-ring';
            ring.style.left = `${18 + Math.random() * 64}%`;
            ring.style.top = `${34 + Math.random() * 38}%`;
            this.waterLayer.appendChild(ring);
            setTimeout(() => ring.remove(), 3500);
            setTimeout(go, 2200 + Math.random() * 4200);
        };
        setTimeout(go, 1200);
    }

    loopGlint() {
        setInterval(() => {
            if (document.hidden || this.game.board.isAnimating) return;
            const g = document.createElement('div');
            g.className = 'glint';
            g.style.left = `${8 + Math.random() * 84}%`;
            g.style.top = `${30 + Math.random() * 45}%`;
            this.waterLayer.appendChild(g);
            setTimeout(() => g.remove(), 2500);
        }, 700);
    }

    // 海鸥：偶尔飞过，并叫一声
    loopGull() {
        const go = () => {
            if (document.hidden || this.game.board.isAnimating) { setTimeout(go, 9000); return; }
            const bird = document.createElement('div');
            const ltr = Math.random() > 0.4;
            const dur = 9 + Math.random() * 4;
            bird.className = `seagull ${ltr ? 'ltr' : 'rtl'}`;
            bird.style.top = `${70 + Math.random() * 140}px`;
            bird.style.animationDuration = `${dur}s`;
            bird.innerHTML = '<svg viewBox="0 0 40 20" width="34" height="17"><path d="M1,13 Q10,2 20,12 Q30,2 39,13 Q29,9 20,15 Q11,9 1,13Z" fill="#fff" stroke="#4a2c17" stroke-width="1.2" stroke-linejoin="round"/></svg>';
            this.gullLayer.appendChild(bird);
            setTimeout(() => window.sounds.playSeagull(), dur * 350);
            setTimeout(() => bird.remove(), dur * 1000 + 300);
            setTimeout(go, 22000 + Math.random() * 28000);
        };
        setTimeout(go, 9000);
    }

    // 季节飘落物：夏天无，春天花瓣，秋天落叶，冬天雪
    spawnParticle() {
        const kind = { spring: 'petal', autumn: 'leaf', winter: 'snow' }[this.game.state.theme];
        if (!kind || document.hidden || this.game.board.isAnimating || this.partLayer.childElementCount > 22) return;
        const p = document.createElement('div');
        p.className = `particle ${kind}`;
        const dur = 7 + Math.random() * 6;
        p.style.left = `${Math.random() * 100}%`;
        p.style.animationDuration = `${dur}s`;
        p.style.setProperty('--sway', `${(Math.random() - 0.5) * 120}px`);
        this.partLayer.appendChild(p);
        setTimeout(() => p.remove(), dur * 1000);
    }

    spawnConfetti() {
        const colors = ['#ee6c5b', '#ffc43d', '#5fd0a0', '#5aa5e8', '#a978e0', '#ff9f5a'];
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < 32; i++) {
            const p = document.createElement('div');
            p.className = 'confetti-piece';
            p.style.background = colors[i % colors.length];
            p.style.left = `${Math.random() * 100}vw`;
            p.style.animationDelay = `${Math.random() * 0.8}s`;
            p.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
            fragment.appendChild(p);
            setTimeout(() => p.remove(), 3800);
        }
        document.body.appendChild(fragment);
    }
}

window.EffectsManager = EffectsManager;

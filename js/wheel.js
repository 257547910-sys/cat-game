// Local calendar grants one daily ticket. Tickets are spent before biscuits.
class LuckyWheel {
    static SPIN_COST = 4;
    constructor(game) {
        this.game = game;
        this.spinning = false;
        this.angle = 0;
        this.modal = document.getElementById('wheel-modal');
        this.canvas = document.getElementById('wheel-canvas');
        this.spinBtn = document.getElementById('wheel-spin-btn');
        this.result = document.getElementById('wheel-result');

        this.imgBiscuit = new Image(); this.imgBiscuit.src = 'assets/images/items/fish_biscuit.png';
        this.imgWand = new Image(); this.imgWand.src = 'assets/images/items/wand.png';
        this.imgMagic = new Image(); this.imgMagic.src = 'assets/images/items/magic_wand.svg';
        [this.imgBiscuit, this.imgWand, this.imgMagic].forEach(i => i.onload = () => this.draw());

        this.segments = [
            { label: '×1', type: 'biscuit', n: 1, w: 32, color: '#fbe3a0' },
            { label: '×1', type: 'wand', n: 1, w: 12, color: '#cfe9ee' },
            { label: '×2', type: 'biscuit', n: 2, w: 20, color: '#f8c9bc' },
            { label: '×3', type: 'biscuit', n: 3, w: 12, color: '#dcefc6' },
            { label: '×2', type: 'wand', n: 2, w: 4, color: '#e3d4f1' },
            { label: '×1', type: 'magic', n: 1, w: 10, color: '#cfe4fb' },
            { label: '福袋', type: 'bundle', w: 10, color: '#ffe08a' }
        ];

        document.getElementById('btn-open-wheel').addEventListener('click', () => this.open());
        document.getElementById('wheel-close-btn').addEventListener('click', () => { if (!this.spinning) this.modal.classList.add('hidden'); });
        this.spinBtn.addEventListener('click', () => this.spin());
        this.draw();
        this.grantDailyTicket();
        this.dailyCheck = setInterval(() => this.grantDailyTicket(), 1000);
        window.addEventListener('focus', () => this.grantDailyTicket());
        document.addEventListener('visibilitychange', () => { if (!document.hidden) this.grantDailyTicket(); });
        // The canvas display size stays unchanged; only its backing resolution grows.
        if (typeof ResizeObserver !== 'undefined') {
            this.resizeObserver = new ResizeObserver(() => this.draw());
            this.resizeObserver.observe(this.canvas.parentElement);
        }
        window.addEventListener('resize', () => this.draw());
    }

    today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    grantDailyTicket() {
        const st = this.game.state, today = this.today();
        if (st.dailyTicketDate === today) return false;
        st.lotteryTickets = (st.lotteryTickets || 0) + 1;
        st.dailyTicketDate = today;
        StorageManager.saveGame(st);
        this.refreshBtn();
        return true;
    }

    open() {
        this.grantDailyTicket();
        this.result.textContent = '';
        this.refreshBtn();
        this.modal.classList.remove('hidden');
        this.draw();
    }

    refreshBtn() {
        document.getElementById('wheel-biscuit-display').textContent = this.game.state.fishBiscuits;
        document.getElementById('wheel-ticket-display').textContent = this.game.state.lotteryTickets || 0;
        this.spinBtn.textContent = this.game.state.lotteryTickets > 0 ? '使用 1 张抽奖券' : `花 ${LuckyWheel.SPIN_COST} 块饼干抽一次`;
        this.spinBtn.disabled = this.spinning;
    }

    draw() {
        const ctx = this.canvas.getContext('2d');
        const S = 280, C = S / 2, R = C - 14;
        // clientWidth ignores the popup's opening animation scale.
        const displaySize = this.canvas.clientWidth || S;
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        const pixels = Math.max(1, Math.round(displaySize * pixelRatio));
        if (this.canvas.width !== pixels || this.canvas.height !== pixels) {
            this.canvas.width = pixels;
            this.canvas.height = pixels;
        }
        ctx.setTransform(pixels / S, 0, 0, pixels / S, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        const arc = Math.PI * 2 / this.segments.length;
        ctx.clearRect(0, 0, S, S);
        ctx.beginPath(); ctx.arc(C, C, R + 10, 0, Math.PI * 2);
        ctx.fillStyle = '#a46f3f'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#4a2c17'; ctx.stroke();

        this.segments.forEach((seg, i) => {
            const a = this.angle + i * arc;
            ctx.beginPath(); ctx.moveTo(C, C); ctx.arc(C, C, R, a, a + arc); ctx.closePath();
            ctx.fillStyle = seg.color; ctx.fill();
            ctx.lineWidth = 3; ctx.strokeStyle = '#4a2c17'; ctx.stroke();

            ctx.save();
            ctx.translate(C, C); ctx.rotate(a + arc / 2);
            ctx.translate(R * 0.66, 0); ctx.rotate(Math.PI / 2);
            if (seg.type === 'biscuit' && this.imgBiscuit.complete && this.imgBiscuit.naturalWidth > 0) ctx.drawImage(this.imgBiscuit, -17, -34, 34, 34);
            else if (seg.type === 'wand' && this.imgWand.complete && this.imgWand.naturalWidth > 0) ctx.drawImage(this.imgWand, -10, -38, 20, 40);
            else if (seg.type === 'magic' && this.imgMagic.complete && this.imgMagic.naturalWidth > 0) ctx.drawImage(this.imgMagic, -13, -39, 26, 39);
            else if (seg.type === 'bundle' && this.imgBiscuit.complete && this.imgBiscuit.naturalWidth > 0 && this.imgWand.complete && this.imgWand.naturalWidth > 0 && this.imgMagic.complete && this.imgMagic.naturalWidth > 0) {
                ctx.drawImage(this.imgBiscuit, -29, -24, 20, 20);
                ctx.drawImage(this.imgWand, -6, -32, 11, 28);
                ctx.drawImage(this.imgMagic, 9, -34, 21, 32);
            }
            ctx.fillStyle = '#4a2c17'; ctx.font = '900 15px sans-serif'; ctx.textAlign = 'center';
            ctx.fillText(seg.label, 0, 18);
            ctx.restore();
        });

        ctx.beginPath(); ctx.arc(C, C, 22, 0, Math.PI * 2);
        ctx.fillStyle = '#ee6c5b'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#4a2c17'; ctx.stroke();
    }

    pick() {
        const total = this.segments.reduce((s, x) => s + x.w, 0);
        let r = Math.random() * total;
        for (let i = 0; i < this.segments.length; i++) { r -= this.segments[i].w; if (r <= 0) return i; }
        return 0;
    }

    spin() {
        if (this.spinning) return;
        const st = this.game.state;
        this.grantDailyTicket();
        if (st.lotteryTickets > 0) st.lotteryTickets--;
        else {
            if (st.fishBiscuits < LuckyWheel.SPIN_COST) { this.result.textContent = '小鱼饼干不够啦'; return; }
            st.fishBiscuits -= LuckyWheel.SPIN_COST;
        }
        this.game.updateHeaderUI();
        this.game.saveState();
        // The title screen may not have a board yet; persist wheel changes anyway.
        StorageManager.saveGame(this.game.state);

        this.spinning = true;
        this.result.textContent = '';
        this.refreshBtn();

        const idx = this.pick();
        const arc = Math.PI * 2 / this.segments.length;
        const target = (5 + Math.floor(Math.random() * 3)) * Math.PI * 2 + (Math.PI * 1.5 - (idx * arc + arc / 2));
        const start = this.angle % (Math.PI * 2);
        const dist = target - start;
        const t0 = performance.now(), dur = 4200;
        let lastSeg = -1;

        const frame = (now) => {
            const p = Math.min((now - t0) / dur, 1);
            this.angle = start + dist * (1 - Math.pow(1 - p, 3));
            this.draw();
            const seg = Math.floor(this.angle / arc);
            if (seg !== lastSeg) { window.sounds.playWheelTick(); lastSeg = seg; }
            if (p < 1) requestAnimationFrame(frame);
            else { this.spinning = false; this.award(this.segments[idx]); }
        };
        requestAnimationFrame(frame);
    }

    award(seg) {
        const st = this.game.state;
        let text;
        if (seg.type === 'biscuit') { st.fishBiscuits += seg.n; text = `小鱼饼干 ×${seg.n}`; }
        else if (seg.type === 'wand') { st.wands += seg.n; text = `染色棒 ×${seg.n}`; }
        else if (seg.type === 'magic') { st.magicWands += seg.n; text = `魔法棒 ×${seg.n}`; }
        else { st.fishBiscuits += 2; st.wands += 1; st.magicWands += 1; text = '福袋：小鱼饼干 ×2 + 染色棒 ×1 + 魔法棒 ×1'; }
        window.sounds.playLevelClear();
        this.result.textContent = `获得 ${text}`;
        this.game.saveState();
        // The title screen may not have a board yet; persist wheel changes anyway.
        StorageManager.saveGame(this.game.state);
        this.game.updateHeaderUI();
        this.game.propsManager.updateUI();
        this.refreshBtn();
    }
}

window.LuckyWheel = LuckyWheel;

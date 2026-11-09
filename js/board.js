// 棋盘：10x10 网格、预选提示、洪水填充、垂直重力、眨眼、粒子
class Board {
    constructor(game) {
        this.game = game;
        this.rows = 10;
        this.cols = 10;
        this.grid = [];
        this.domBoard = document.getElementById('game-board');
        this.isAnimating = false;
        this.selectedGroup = null;

        // 猫咪原图配色，hex 用于消除时的碎屑
        this.colors = [
            { id: 0, name: 'pink', normal: 'assets/images/cats/cat_pink.png', blink: 'assets/images/cats/cat_pink_blink.png', hex: '#f5a3b5' },
            { id: 1, name: 'purple', normal: 'assets/images/cats/cat_purple.png', blink: 'assets/images/cats/cat_purple_blink.png', hex: '#b3a6e3' },
            { id: 2, name: 'navy', normal: 'assets/images/cats/cat_navy.png', blink: 'assets/images/cats/cat_navy_blink.png', hex: '#4a5470' },
            { id: 3, name: 'orange', normal: 'assets/images/cats/cat_orange.png', blink: 'assets/images/cats/cat_orange_blink.png', hex: '#f8b36a' },
            { id: 4, name: 'green', normal: 'assets/images/cats/cat_green.png', blink: 'assets/images/cats/cat_green_blink.png', hex: '#8fd4aa' }
        ];

        this.domBoard.addEventListener('pointerdown', (e) => {
            const cell = e.target.closest('.board-cell');
            if (cell) this.handleClick(+cell.dataset.row, +cell.dataset.col);
        });
        // 点棋盘以外的地方取消预选
        document.addEventListener('pointerdown', (e) => {
            if (this.selectedGroup && !e.target.closest('#game-board')) this.clearSelection();
        });

        this.domBoard.addEventListener('animationend', event => {
            if (event.target.classList.contains('cat-sprite')) {
                if (event.animationName === 'dropIn') event.target.classList.remove('falling');
                if (event.animationName === 'spawnIn') event.target.classList.remove('spawn');
            }
        });
        this.startBlinkLoop();
    }

    init(savedGrid = null, animate = true) {
        this.clearSelection();
        this.turnId = (this.turnId || 0) + 1;
        this.isAnimating = false;
        if (savedGrid && Array.isArray(savedGrid) && savedGrid.length === this.rows) {
            this.grid = savedGrid.map(row => [...row]);
        } else {
            this.generateRandomBoard();
        }
        this.render(null, animate);
    }

    generateRandomBoard() {
        if (this.game.state.mode === 'endless') {
            // Six settled rows leave room for rising layers and magic cats.
            this.grid = Array.from({ length: this.rows }, (_, r) =>
                Array.from({ length: this.cols }, () => r < 4 ? null : Math.floor(Math.random() * 5)));
            // A gentle opening assist is confined to the initial board.
            for (let r = 4; r < this.rows; r++) for (let c = 1; c < this.cols; c++) {
                if (Math.random() < .12) this.grid[r][c] = this.grid[r][c - 1];
            }
            if (!this.hasValidMoves()) this.grid[9][1] = this.grid[9][0];
            return;
        }
        let tries = 0;
        do {
            this.grid = Array.from({ length: this.rows }, () =>
                Array.from({ length: this.cols }, () => Math.floor(Math.random() * this.colors.length)));
            const clusterChance = ScoringSystem.getOpeningClusterChance(this.game.state.stage);
            if (clusterChance > 0) {
                for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
                    if (Math.random() >= clusterChance) continue;
                    const neighbors = [];
                    if (r > 0) neighbors.push(this.grid[r - 1][c]);
                    if (c > 0) neighbors.push(this.grid[r][c - 1]);
                    if (neighbors.length) this.grid[r][c] = neighbors[Math.floor(Math.random() * neighbors.length)];
                }
            }
            tries++;
        } while (this.countMovesGroups() < 8 && tries < 30);
    }

    // 可消除的组数（用于保证开局不太死）
    countMovesGroups() {
        const seen = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
        let n = 0;
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
            if (seen[r][c] || this.grid[r][c] === null) continue;
            const g = this.getConnectedGroup(r, c);
            g.forEach(p => seen[p.r][p.c] = true);
            if (g.length >= 2) n++;
        }
        return n;
    }

    getConnectedGroup(sr, sc) {
        const color = this.grid[sr][sc];
        if (color === null || color === undefined) return [];
        const seen = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));
        const group = [];
        const stack = [[sr, sc]];
        seen[sr][sc] = true;
        while (stack.length) {
            const [r, c] = stack.pop();
            group.push({ r, c });
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols && !seen[nr][nc] && this.grid[nr][nc] === color) {
                    seen[nr][nc] = true;
                    stack.push([nr, nc]);
                }
            }
        }
        return group;
    }

    hasValidMoves() {
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
            const v = this.grid[r][c];
            if (v === null) continue;
            if (c + 1 < this.cols && this.grid[r][c + 1] === v) return true;
            if (r + 1 < this.rows && this.grid[r + 1][c] === v) return true;
        }
        return false;
    }

    countRemaining() {
        let n = 0;
        this.grid.forEach(row => row.forEach(v => { if (v !== null) n++; }));
        return n;
    }

    clearSelection() {
        if (this.selectedGroup) {
            this.selectedGroup.forEach(({ r, c }) => {
                const el = this.getCellElement(r, c);
                if (el) el.classList.remove('sel');
            });
            this.selectedGroup = null;
        }
    }

    isCellSelected(r, c) {
        return !!this.selectedGroup && this.selectedGroup.some(p => p.r === r && p.c === c);
    }

    // 第一下：白边高亮预选；第二下（点同一组）：确认消除
    handleClick(r, c) {
        if (this.isAnimating || !this.game.playing) return;

        if (this.game.state.settled) return;
        if (this.game.propsManager.isToolActive()) {
            this.clearSelection();
            this.game.propsManager.applyToolToCell(r, c);
            return;
        }
        if (this.grid[r][c] === null) { this.clearSelection(); return; }

        const group = this.getConnectedGroup(r, c);
        if (group.length < 2) {
            this.clearSelection();
            const el = this.getCellElement(r, c);
            if (el) { el.classList.add('nope'); setTimeout(() => el.classList.remove('nope'), 380); }
            window.sounds.playSelectChirp();
            return;
        }
        if (this.isCellSelected(r, c)) {
            this.clearSelection();
            this.eliminateGroup(group);
            return;
        }
        this.selectGroup(group);
    }

    selectGroup(group) {
        this.clearSelection();
        this.selectedGroup = group;
        group.forEach(({ r, c }) => {
            const el = this.getCellElement(r, c);
            if (el) el.classList.add('sel');
        });
        window.sounds.playSelectChirp();


    }

    async eliminateGroup(group) {
        this.isAnimating = true;
        const turnId = this.turnId;
        const endless = this.game.state.mode === 'endless';
        const count = group.length;
        const gained = ScoringSystem.calculateEliminationScore(count);
        this.game.vibrateElimination(count);

        window.sounds.maybeMeow(count <= 3 ? 'kitten' : count <= 7 ? 'normal' : 'big');
        window.sounds.playPop(Math.min(1.7, 1 + (count - 2) * 0.05), count);

        // Read all positions before changing styles: avoid one forced layout per cat.
        const targets = group.map(({ r, c }) => {
            const el = this.getCellElement(r, c);
            return el ? { el, rect: el.getBoundingClientRect(), color: this.colors[this.grid[r][c]].hex } : null;
        }).filter(Boolean);
        let cx = 0, cy = 0;
        const fragments = document.createDocumentFragment();
        const stride = Math.max(1, Math.ceil(targets.length / 12));
        targets.forEach(({ el, rect, color }, index) => {
            const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
            cx += x; cy += y;
            if (index % stride === 0) this.spawnCrumbs(x, y, color, fragments);
            el.classList.remove('sel');
            el.classList.add('pop');
        });
        document.body.appendChild(fragments);
        this.showFloatingScore(gained, count, cx / count, cy / count);
        if (count >= 6) this.game.shake();

        if (!endless) this.game.addScore(gained);
        await new Promise(res => setTimeout(res, 240));
        if (this.turnId !== turnId) return;

        group.forEach(({ r, c }) => { this.grid[r][c] = null; });
        const fall = this.applyGravity();
        this.render(fall);

        await new Promise(res => setTimeout(res, 420));
        if (this.turnId !== turnId) return;
        if (endless) {
            const incoming = this.refillEndlessLayer(this.game.state.score + gained);
            this.render(incoming);
            window.sounds.playDropSplash();
            await new Promise(res => setTimeout(res, 420));
            if (this.turnId !== turnId) return;
            this.game.addScore(gained);
        }
        this.isAnimating = false;
        this.game.onBoardStateChanged();
    }

    // Exactly one incoming cat per non-full column. Full columns are untouched.
    refillEndlessLayer(score) {
        const counts = Array(5).fill(0);
        this.grid.forEach(row => row.forEach(id => { if (id !== null) counts[id]++; }));
        const fall = {};
        // Shuffle column order so sequential balance adjustments have no left bias.
        const columns = Array.from({ length: this.cols }, (_, c) => c);
        for (let i = columns.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [columns[i], columns[j]] = [columns[j], columns[i]];
        }
        for (const c of columns) {
            if (this.grid[0][c] !== null) continue;
            const r = this.getLandingRow(0, c);
            const weights = ScoringSystem.getEndlessWeights(counts, score);
            let draw = Math.random(), color = 4;
            for (let id = 0; id < 5; id++) {
                draw -= weights[id];
                if (draw < 0) { color = id; break; }
            }
            this.grid[r][c] = color;
            counts[color]++;
            fall[`${r},${c}`] = r + 1;
        }
        return fall;
    }

    // 纯垂直重力；返回 {"新行,列": 下落格数}
    applyGravity() {
        const fall = {};
        for (let c = 0; c < this.cols; c++) {
            const cats = [];
            for (let r = this.rows - 1; r >= 0; r--) {
                if (this.grid[r][c] !== null) cats.push({ v: this.grid[r][c], from: r });
            }
            for (let r = this.rows - 1, i = 0; r >= 0; r--, i++) {
                if (i < cats.length) {
                    this.grid[r][c] = cats[i].v;
                    if (r - cats[i].from > 0) fall[`${r},${c}`] = r - cats[i].from;
                } else {
                    this.grid[r][c] = null;
                }
            }
        }
        return fall;
    }

    setCatColor(r, c, newColorId) {
        this.clearSelection();
        this.grid[r][c] = newColorId;
        this.render();
        this.game.onBoardStateChanged();
    }

    getLandingRow(r, c) {
        while (r + 1 < this.rows && this.grid[r + 1][c] === null) r++;
        return r;
    }

    placeMagicCat(r, c, colorId) {
        if (this.isAnimating || !this.game.playing || this.game.state.settled ||
            !Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= this.rows || c < 0 || c >= this.cols ||
            !this.colors[colorId] || this.grid[r][c] !== null) return false;
        this.clearSelection();
        this.isAnimating = true;
        const landingRow = this.getLandingRow(r, c);
        this.grid[r][c] = colorId;
        const fall = this.applyGravity();
        this.render(fall);
        this.getCellElement(landingRow, c)?.classList.add('magic-born');
        setTimeout(() => {
            this.isAnimating = false;
            this.game.onBoardStateChanged();
        }, 450);
        return true;
    }

    startBlinkLoop() {
        setInterval(() => {
            if (document.hidden || !this.game.playing || this.isAnimating || this.grid.length !== this.rows) return;
            const cells = [];
            for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
                if (this.grid[r][c] !== null) cells.push({ r, c });
            }
            if (!cells.length) return;
            const n = 1 + Math.floor(Math.random() * 3);
            for (let i = 0; i < n; i++) {
                const t = cells[Math.floor(Math.random() * cells.length)];
                const img = this.getCellElement(t.r, t.c)?.querySelector('img');
                if (!img || img.classList.contains('falling')) continue;
                const color = this.grid[t.r][t.c];
                img.src = this.colors[color].blink;
                setTimeout(() => {
                    if (this.grid[t.r][t.c] === color) img.src = this.colors[color].normal;
                }, 200);
            }
        }, 1800);
    }

    getCellElement(r, c) {
        return this.cells?.[r * this.cols + c] || null;
    }

    render(fall = null, spawn = false) {
        // Keep the 100 cells and surviving images instead of rebuilding the board each turn.
        if (!this.cells || this.domBoard.children.length !== this.rows * this.cols) {
            this.cells = [];
            const fragment = document.createDocumentFragment();
            for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
                const cell = document.createElement('div');
                cell.className = 'board-cell';
                cell.dataset.row = r;
                cell.dataset.col = c;
                this.cells.push(cell);
                fragment.appendChild(cell);
            }
            this.domBoard.replaceChildren(fragment);
        }
        for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
            const cell = this.getCellElement(r, c);
            const id = this.grid[r][c];
            const empty = id === null || id === undefined;
            cell.className = empty ? 'board-cell cell-empty' : 'board-cell';
            let img = cell.firstElementChild;
            if (empty) {
                if (img) cell.replaceChildren();
                continue;
            }
            if (!img || img.tagName !== 'IMG') {
                img = document.createElement('img');
                img.alt = '';
                img.draggable = false;
                cell.replaceChildren(img);
            }
            while (cell.children.length > 1) cell.lastElementChild.remove();
            const source = this.colors[id].normal;
            if (img.getAttribute('src') !== source) img.src = source;
            img.className = 'cat-sprite';
            img.style.animationDelay = '';
            img.style.removeProperty('--fall');
            if (spawn) {
                img.classList.add('spawn');
                img.style.animationDelay = `${c * 22 + (this.rows - 1 - r) * 28}ms`;
            } else if (fall && fall[`${r},${c}`]) {
                img.classList.add('falling');
                img.style.setProperty('--fall', fall[`${r},${c}`]);
            }
        }
        this.game.updateFooterInfo();
    }

    spawnCrumbs(x, y, color, fragment) {
        for (let i = 0; i < 4; i++) {
            const p = document.createElement('div');
            p.className = 'crumb';
            p.style.left = `${x}px`;
            p.style.top = `${y}px`;
            p.style.background = color;
            const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 34;
            p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
            p.style.setProperty('--dy', `${Math.sin(a) * d - 12}px`);
            (fragment || document.body).appendChild(p);
            setTimeout(() => p.remove(), 700);
        }
    }

    showFloatingScore(score, count, x, y) {
        const f = document.createElement('div');
        f.className = 'floating-score';
        f.style.left = `${x}px`;
        f.style.top = `${y}px`;
        let html = `<div class="score-num">+${score}</div>`;
        const praise = ScoringSystem.getPraise(count);
        if (praise) html += `<div class="score-praise ${praise.className}">${praise.text}</div>`;
        f.innerHTML = html;
        document.body.appendChild(f);
        setTimeout(() => f.remove(), 1200);
    }
}

window.Board = Board;

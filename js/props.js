// Two tools share one inventory. Stock is spent only after a valid color is confirmed.
class PropsManager {
    static PRICE = 5;

    constructor(game) {
        this.game = game;
        this.activeTool = null;
        this.selectedCatCoords = null;
        this.modal = document.getElementById('props-modal');
        this.colorPickerModal = document.getElementById('color-picker-modal');
        this.colorPickerOptions = document.getElementById('color-picker-options');
        this.bindEvents();
    }

    bindEvents() {
        const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
        on('btn-props', () => this.open());
        on('props-close-btn', () => { this.modal.classList.add('hidden'); this.game.onBoardStateChanged(); });
        on('props-cancel-tool-btn', () => { this.cancelTool(); this.game.onBoardStateChanged(); });
        on('use-dye-btn', () => this.beginTool('dye'));
        on('use-magic-btn', () => this.beginTool('magic'));
        on('color-picker-cancel', () => { this.cancelTool(); this.game.onBoardStateChanged(); });
        this.modal.addEventListener('click', e => {
            if (e.target === this.modal) { this.modal.classList.add('hidden'); this.game.onBoardStateChanged(); }
        });
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape') return;
            if (!this.colorPickerModal.classList.contains('hidden') || this.activeTool) this.cancelTool();
            this.modal.classList.add('hidden');
            if (this.game.playing) this.game.onBoardStateChanged();
        });
    }

    open() {
        if (!this.game.playing || this.game.state.settled) return;
        if (this.game.board.isAnimating) { this.showToast('等猫咪落稳后再选择道具'); return; }
        this.game.board.clearSelection();
        this.updateUI();
        this.modal.classList.remove('hidden');
    }

    isToolActive() { return this.activeTool !== null; }
    isWandActive() { return this.activeTool === 'dye'; }
    isChoosingTool() {
        return this.isToolActive() || [this.modal, this.colorPickerModal, document.getElementById('shop-modal')]
            .some(modal => !modal.classList.contains('hidden'));
    }

    updateUI() {
        const st = this.game.state;
        document.getElementById('magic-count').textContent = `×${st.magicWands}`;
        document.getElementById('dye-count').textContent = `×${st.wands}`;
        document.getElementById('use-magic-btn').textContent = st.magicWands ? '使用' : '去购买';
        document.getElementById('use-dye-btn').textContent = st.wands ? '使用' : '去购买';
        document.getElementById('btn-props').classList.toggle('wand-active-glow', this.isToolActive());
        document.getElementById('props-cancel-tool-btn').classList.toggle('hidden', !this.isToolActive());
    }

    beginTool(tool) {
        const board = this.game.board;
        if (!['dye', 'magic'].includes(tool) || !this.game.playing || this.game.state.settled || board.isAnimating) return;
        const field = tool === 'magic' ? 'magicWands' : 'wands';
        if (this.game.state[field] < 1) {
            this.cancelTool();
            this.promptBuyWand();
            return;
        }
        if (tool === 'magic' && board.countRemaining() === board.rows * board.cols) {
            this.showToast('棋盘还没有空格，先消除一些猫咪吧');
            return;
        }
        if (tool === 'dye' && board.countRemaining() === 0) {
            this.showToast('棋盘上没有猫咪可以染色');
            return;
        }
        this.cancelTool();
        this.activeTool = tool;
        this.modal.classList.add('hidden');
        board.clearSelection();
        document.body.classList.toggle('wand-cursor-active', tool === 'dye');
        board.domBoard.classList.toggle('magic-placement', tool === 'magic');
        this.updateUI();
        window.sounds.playWandMagic();
        this.showToast(tool === 'magic' ? '点击一个空格，再选择猫咪的颜色' : '点击要换颜色的猫咪');
    }

    cancelTool() {
        this.activeTool = null;
        this.selectedCatCoords = null;
        this.colorPickerModal.classList.add('hidden');
        this.modal.classList.add('hidden');
        document.body.classList.remove('wand-cursor-active');
        this.game.board.domBoard.classList.remove('magic-placement');
        this.game.board.domBoard.querySelectorAll('.magic-target').forEach(cell => cell.classList.remove('magic-target'));
        this.updateUI();
    }

    deactivateWand() { this.cancelTool(); }
    toggleWandMode() { this.activeTool === 'dye' ? this.cancelTool() : this.beginTool('dye'); }
    applyWandToCat(r, c) { this.applyToolToCell(r, c); }

    applyToolToCell(r, c) {
        const board = this.game.board;
        if (!this.activeTool || board.isAnimating || this.game.state.settled || !board.grid[r] || c < 0 || c >= board.cols) return;
        const currentColor = board.grid[r][c];
        if (this.activeTool === 'magic' && currentColor !== null) {
            this.showToast('魔法棒只能在没有猫咪的空格使用');
            return;
        }
        if (this.activeTool === 'dye' && currentColor === null) {
            this.showToast('染色棒需要选择一只猫咪');
            return;
        }
        this.selectedCatCoords = { r, c, currentColor };
        if (this.activeTool === 'magic') {
            board.domBoard.querySelectorAll('.magic-target').forEach(cell => cell.classList.remove('magic-target'));
            board.getCellElement(board.getLandingRow(r, c), c)?.classList.add('magic-target');
        }
        this.showColorPicker(r, c, currentColor);
    }

    showColorPicker(r, c, currentColor) {
        const magic = this.activeTool === 'magic';
        document.getElementById('color-picker-heading').textContent = magic ? '变出什么颜色' : '染成什么颜色';
        document.getElementById('color-picker-description').textContent = magic
            ? `猫咪会落在第 ${this.game.board.getLandingRow(r, c) + 1} 行；选好颜色后消耗 1 根魔法棒`
            : '选择颜色后消耗 1 根染色棒';
        this.colorPickerOptions.innerHTML = '';
        this.game.board.colors.forEach(color => {
            if (!magic && color.id === currentColor) return;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'color-opt-btn';
            btn.dataset.color = color.id;
            btn.setAttribute('aria-label', `选择第 ${color.id + 1} 种颜色`);
            btn.innerHTML = `<img src="${color.normal}" alt="" class="color-opt-cat">`;
            btn.addEventListener('click', e => { e.stopPropagation(); this.confirmDye(color.id); });
            this.colorPickerOptions.appendChild(btn);
        });
        this.colorPickerModal.classList.remove('hidden');
    }

    hideColorPicker() { this.colorPickerModal.classList.add('hidden'); }

    confirmDye(newColorId) {
        const board = this.game.board, st = this.game.state;
        if (!this.selectedCatCoords || !this.activeTool || !this.game.playing || st.settled || board.isAnimating || !board.colors[newColorId]) return;
        const { r, c, currentColor } = this.selectedCatCoords;
        const magic = this.activeTool === 'magic';
        const field = magic ? 'magicWands' : 'wands';
        if (st[field] < 1 || !board.grid[r] || board.grid[r][c] !== currentColor ||
            (magic ? currentColor !== null : currentColor === null || currentColor === newColorId)) return;
        // Deduct and mutate the board in the same event, then save the complete result.
        st[field]--;
        if (magic) {
            if (!board.placeMagicCat(r, c, newColorId)) { st[field]++; return; }
            // Gravity is already computed; save the new cat with its spent wand atomically.
            st.board = board.grid.map(row => [...row]);
            st.hasSavedGame = true;
            this.cancelTool();
        } else {
            this.cancelTool();
            board.setCatColor(r, c, newColorId);
        }
        this.persist();
        this.updateUI();
        window.sounds.playDropSplash();
        window.sounds.playWandMagic();
        this.showToast(magic ? '新伙伴来啦！同色猫咪现在可以连在一起了' : '染色成功！');
    }

    promptBuyWand() {
        document.getElementById('shop-biscuit-display').textContent = this.game.state.fishBiscuits;
        document.getElementById('shop-modal').classList.remove('hidden');
    }

    persist() {
        this.game.saveState();
        StorageManager.saveGame(this.game.state);
    }

    buyTool(tool) {
        if (!['dye', 'magic'].includes(tool)) return false;
        const st = this.game.state;
        if (st.fishBiscuits < PropsManager.PRICE) {
            this.showToast('小鱼饼干不足，需要 5 个小鱼饼干');
            return false;
        }
        st.fishBiscuits -= PropsManager.PRICE;
        st[tool === 'magic' ? 'magicWands' : 'wands']++;
        this.persist();
        this.game.updateHeaderUI();
        document.getElementById('shop-biscuit-display').textContent = st.fishBiscuits;
        this.updateUI();
        window.sounds.playWandMagic();
        this.showToast(`获得 1 根${tool === 'magic' ? '魔法棒' : '染色棒'}！`);
        return true;
    }

    buyWand() { return this.buyTool('dye'); }
    buyMagicWand() { return this.buyTool('magic'); }

    showToast(msg) {
        document.querySelectorAll('.game-toast').forEach(toast => toast.remove());
        const toast = document.createElement('div');
        toast.className = 'game-toast';
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => toast.remove(), 400);
        }, 2200);
    }
}
window.PropsManager = PropsManager;

// 游戏主控：标题画面、关卡流程、存档、结算
class PopCatGame {
    constructor() {
        this.state = StorageManager.loadGame();
        this.playing = false;
        this.shownScore = 0;
        this.init();
    }

    $(id) { return document.getElementById(id); }

    init() {
        this.state.targetScore = ScoringSystem.getTargetScore(this.state.stage);
        this.state.highScore = Math.max(this.state.highScore || 0, StorageManager.getPersonalBest('stage'));
        this.state.endlessBest = Math.max(this.state.endlessBest || 0, StorageManager.getPersonalBest('endless'));
        this.board = new Board(this);
        this.state.catPalette = CatPalettes.normalize(this.state.catPalette);
        this.board.colors = CatPalettes.getColors(this.state.catPalette);
        this.propsManager = new PropsManager(this);
        this.luckyWheel = new LuckyWheel(this);
        this.leaderboardUI = new LeaderboardUI(this);
        this.effects = new EffectsManager(this);

        this.bindUI();
        this.shownScore = this.state.score;
        this.updateHeaderUI();
        this.propsManager.updateUI();
        this.setupTitle();

        window.addEventListener('beforeunload', () => this.saveState());
        window.addEventListener('blur', () => this.saveState());
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.saveState(); });
    }

    // ---------- 标题 ----------
    setupTitle() {
        clearTimeout(this.settlementTimer);
        if (this.state.runFailed) {
            Object.assign(this.state, StorageManager.resetRun(this.state));
            this.board.grid = [];
            this.board.isAnimating = false;
            this.board.domBoard.replaceChildren();
            this.shownScore = 0;
            this.updateHeaderUI();
            this.updateFooterInfo();
            StorageManager.saveGame(this.state);
        }
        this.propsManager.cancelTool();
        const cats = this.$('title-cats');
        cats.innerHTML = this.board.colors.map(c => `<img src="${c.normal}" alt="">`).join('');
        const stageRun = StorageManager.getSavedRun(this.state, 'stage');
        const endlessRun = StorageManager.getSavedRun(this.state, 'endless');
        const cont = this.$('title-continue');
        cont.classList.toggle('hidden', !stageRun);
        cont.textContent = stageRun ? `继续游戏 · 第 ${stageRun.stage} 关` : '继续游戏';
        this.$('title-endless').textContent = endlessRun ? '继续无尽模式' : '无尽模式';
        this.$('title-best').textContent = `关卡最高 ${this.state.highScore.toLocaleString()} · 无尽最高 ${(this.state.endlessBest || 0).toLocaleString()}`;
        this.$('title-screen').classList.remove('hidden');
        this.playing = false;
    }

    hideTitle() { this.$('title-screen').classList.add('hidden'); }

    continueGame(mode = 'stage') {
        const run = StorageManager.getSavedRun(this.state, mode);
        if (!run) {
            if (mode === 'endless') this.newEndlessGame();
            else this.newGame();
            return;
        }
        clearTimeout(this.settlementTimer);
        this.propsManager.cancelTool();
        // Only run progress is restored. Currency, tools and preferences remain shared and current.
        Object.assign(this.state, StorageManager.resetRun(this.state), run);
        this.hideTitle();
        this.playing = true;
        this.shownScore = this.state.score;
        this.board.init(this.state.board, false);
        this.updateHeaderUI();
        this.propsManager.updateUI();
        if (this.state.settled && !this.board.hasValidMoves()) this.showSettlement(this.state.settleBonus || 0);
        else if (!this.state.settled) this.onBoardStateChanged();
    }

    newEndlessGame() {
        Object.assign(this.state, StorageManager.resetRun(this.state), { mode: 'endless' });
        this.hideTitle();
        this.playing = true;
        this.startStage();
    }

    newGame() {
        Object.assign(this.state, StorageManager.resetRun(this.state));
        this.hideTitle();
        this.playing = true;
        this.startStage();
    }

    startStage(carryScore = null) {
        if (this.state.runFailed) this.state.stage = 1;
        this.state.runFailed = false;
        this.state.settleReward = null;
        this.state.settleBonus = 0;
        this.state.baseScore = 0;
        clearTimeout(this.settlementTimer);
        this.propsManager.cancelTool();
        this.$('endless-rescue-modal').classList.add('hidden');
        this.state.targetScore = ScoringSystem.getTargetScore(this.state.stage);
        this.state.score = this.state.mode === 'endless' ? 0
            : (carryScore ?? this.state.stageStartScore ?? 0);
        this.state.stageStartScore = this.state.score;
        this.state.endlessRewarded = 0;
        this.state.endlessTicketRewards = 0;
        this.state.endlessRewardCheckpoint = 0;
        this.state.personalRecordReward = null;
        this.state.settled = false;
        this.shownScore = this.state.score;
        this.board.init(null, true);
        this.saveState();
        this.updateHeaderUI();
        this.propsManager.updateUI();
    }

    // 需要二次点击确认的按钮
    arm(btn, armedText, fn, shouldConfirm = () => true) {
        btn.addEventListener('click', () => {
            if (!shouldConfirm()) { fn(); return; }
            if (btn.dataset.armed) { clearTimeout(+btn.dataset.armed); delete btn.dataset.armed; btn.textContent = btn.dataset.text; fn(); return; }
            btn.dataset.text = btn.textContent;
            btn.textContent = armedText;
            btn.dataset.armed = setTimeout(() => { btn.textContent = btn.dataset.text; delete btn.dataset.armed; }, 2500);
        });
    }

    vibrateElimination(count) {
        if (count < 2 || !this.state.vibrationEnabled || document.hidden) return;
        const webVibrate = () => {
            if (typeof navigator.vibrate !== 'function') return false;
            try { return navigator.vibrate(25); } catch (e) { return false; }
        };
        // Native haptics are usable when this web game is hosted by a Capacitor app
        // that actually installs the Haptics plugin. Ordinary browsers use the web API.
        const cap = window.Capacitor;
        if (cap?.isNativePlatform?.() && cap.isPluginAvailable?.('Haptics') && cap.Plugins?.Haptics?.impact) {
            try { Promise.resolve(cap.Plugins.Haptics.impact({ style: 'LIGHT' })).catch(webVibrate); }
            catch (e) { webVibrate(); }
        } else webVibrate();
    }

    bindUI() {
        const on = (id, fn) => this.$(id).addEventListener('click', fn);

        on('title-continue', () => this.continueGame('stage'));
        on('title-endless', () => this.continueGame('endless'));
        on('endless-rescue-btn', () => {
            this.$('endless-rescue-modal').classList.add('hidden');
            this.propsManager.open();
        });
        on('endless-finish-btn', () => {
            this.$('endless-rescue-modal').classList.add('hidden');
            this.handleSettlement();
        });
        const newBtn = this.$('title-new');
        this.arm(newBtn, '会清除关卡进度，再点确认', () => this.newGame(),
            () => !!StorageManager.getSavedRun(this.state, 'stage'));
        on('title-rank', () => this.leaderboardUI.open());

        const vibration = this.$('vibration-enabled');
        vibration.checked = this.state.vibrationEnabled !== false;
        vibration.addEventListener('change', () => {
            this.state.vibrationEnabled = vibration.checked;
            if (!vibration.checked && typeof navigator.vibrate === 'function') {
                try { navigator.vibrate(0); } catch (e) {}
            }
            StorageManager.saveGame(this.state);
        });
        const legacyMuted = this.state.soundEnabled === false;
        window.sounds.configure(this.state.musicVolume ?? (legacyMuted ? 0 : 0.55), this.state.sfxVolume ?? (legacyMuted ? 0 : 0.75));
        this.state.musicVolume = window.sounds.musicVolume;
        this.state.sfxVolume = window.sounds.sfxVolume;
        this.bindPaletteSettings();
        const settings = this.$('settings-modal');
        const openSettings = () => {
            settings.classList.remove('hidden');
            this.$('music-volume').focus();
        };
        on('btn-settings', openSettings);
        on('title-settings', openSettings);
        on('menu-btn-settings', openSettings);
        const closeSettings = () => {
            settings.classList.add('hidden');
            (this.$('title-screen').classList.contains('hidden') ? this.$('btn-settings') : this.$('title-settings')).focus();
        };
        on('settings-close-btn', closeSettings);
        settings.addEventListener('click', e => { if (e.target === settings) closeSettings(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && !settings.classList.contains('hidden')) closeSettings();
        });
        [['music', 'musicVolume'], ['sfx', 'sfxVolume']].forEach(([name, key]) => {
            const slider = this.$(`${name}-volume`);
            const output = this.$(`${name}-volume-value`);
            slider.value = Math.round(window.sounds[key] * 100);
            output.value = `${slider.value}%`;
            slider.addEventListener('input', () => {
                this.state[key] = Number(slider.value) / 100;
                this.state.soundEnabled = true;
                window.sounds[key] = this.state[key];
                window.sounds.applyVolumes();
                output.value = `${slider.value}%`;
                // Persist settings even before a game has been started.
                StorageManager.saveGame(this.state);
            });
            if (name === 'sfx') slider.addEventListener('change', () => window.sounds.playPop(1.2));
        });

        on('btn-exit', () => {
            if (this.board.isAnimating) { this.propsManager.showToast('等猫咪落稳后再暂停'); return; }
            this.$('menu-modal').classList.remove('hidden');
        });
        on('menu-btn-resume', () => this.$('menu-modal').classList.add('hidden'));
        this.arm(this.$('menu-btn-restart'), '再点一次确认重开', () => {
            this.$('menu-modal').classList.add('hidden');
            this.startStage();
        });
        on('menu-btn-home', () => {
            this.$('menu-modal').classList.add('hidden');
            this.saveState();
            this.setupTitle();
        });

        on('btn-open-shop', () => { this.$('shop-biscuit-display').textContent = this.state.fishBiscuits; this.$('shop-modal').classList.remove('hidden'); });
        on('shop-close-btn', () => { this.$('shop-modal').classList.add('hidden'); if (this.playing) this.onBoardStateChanged(); });
        on('shop-buy-magic-btn', () => this.propsManager.buyMagicWand());
        on('shop-buy-wand-btn', () => {
            if (this.propsManager.buyWand()) this.$('shop-biscuit-display').textContent = this.state.fishBiscuits;
        });
        on('settlement-title-btn', () => { this.$('settlement-modal').classList.add('hidden'); this.setupTitle(); });
    }

    bindPaletteSettings() {
        const choices = this.$('palette-options');
        CatPalettes.options.forEach((palette, index) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'palette-option';
            btn.dataset.palette = palette.id;
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-label', `配色 ${index + 1}`);
            btn.innerHTML = CatPalettes.getColors(palette.id).map(color =>
                `<img src="${color.normal}" alt="" draggable="false">`).join('') + '<span class="palette-check" aria-hidden="true">✓</span>';
            btn.addEventListener('click', () => this.applyCatPalette(palette.id));
            btn.addEventListener('keydown', event => {
                const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
                if (!keys.includes(event.key)) return;
                event.preventDefault();
                const count = CatPalettes.options.length;
                const step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? count - 1 : (index + step + count) % count;
                this.applyCatPalette(CatPalettes.options[next].id);
                choices.children[next].focus();
            });
            choices.appendChild(btn);
        });
        this.updatePaletteSelection();
    }

    updatePaletteSelection() {
        this.$('palette-options').querySelectorAll('.palette-option').forEach(btn => {
            const selected = Number(btn.dataset.palette) === this.state.catPalette;
            btn.setAttribute('aria-checked', String(selected));
            btn.tabIndex = selected ? 0 : -1;
        });
    }

    applyCatPalette(id) {
        this.state.catPalette = CatPalettes.normalize(id);
        this.board.clearSelection();
        this.board.colors = CatPalettes.getColors(this.state.catPalette);
        if (this.board.grid.length) this.board.render();
        this.$('title-cats').innerHTML = this.board.colors.map(color => `<img src="${color.normal}" alt="">`).join('');
        const selected = this.propsManager.selectedCatCoords;
        if (selected && !this.$('color-picker-modal').classList.contains('hidden')) {
            this.propsManager.showColorPicker(selected.r, selected.c, selected.currentColor);
        }
        this.updatePaletteSelection();
        this.saveState();
        StorageManager.saveGame(this.state);
    }

    // ---------- 分数与界面 ----------
    addScore(points) {
        this.state.score += points;
        if (this.state.mode === 'endless') {
            const earned = Math.floor(this.state.score / ScoringSystem.ENDLESS_REWARD_STEP);
            const extra = Math.max(0, earned - this.state.endlessRewardCheckpoint);
            if (extra) {
                this.state.endlessRewardCheckpoint = earned;
                let biscuits = 0, tickets = 0;
                for (let i = 0; i < extra; i++) {
                    const reward = ScoringSystem.rollBasicReward();
                    biscuits += reward.fishBiscuits;
                    tickets += reward.lotteryTickets;
                }
                this.state.endlessRewarded += biscuits;
                this.state.endlessTicketRewards = (this.state.endlessTicketRewards || 0) + tickets;
                this.state.fishBiscuits += biscuits;
                this.state.lotteryTickets += tickets;
                this.propsManager.showToast(`无尽奖励：${[biscuits ? `小鱼饼干 +${biscuits}` : '', tickets ? `抽奖券 +${tickets}` : ''].filter(Boolean).join('、')}！`);
                window.sounds.playMenuTap();
            }
        }
        this.updateHeaderUI();
        this.saveState();
    }

    updateHeaderUI() {
        const s = this.state;
        const endless = s.mode === 'endless';
        this.$('stage-prefix').textContent = endless ? '无尽' : '第';
        this.$('stage-suffix').textContent = endless ? '模式' : '关';
        this.$('display-stage').textContent = endless ? '∞' : s.stage;
        this.$('display-target').textContent = s.score >= s.targetScore ? `总分达标 · 目标 ${s.targetScore.toLocaleString()}` : `累计目标 ${s.targetScore.toLocaleString()}`;
        this.$('display-biscuits').textContent = s.fishBiscuits;
        this.$('wheel-biscuit-display').textContent = s.fishBiscuits;
        this.$('target-progress-fill').style.width = `${Math.min(100, (s.score / s.targetScore) * 100)}%`;
        this.$('goal-bar').classList.toggle('reached', s.score >= s.targetScore);
        if (endless) {
            const step = ScoringSystem.ENDLESS_REWARD_STEP;
            this.$('display-target').textContent = `再得 ${step - s.score % step} 分 · 获得奖励`;
            this.$('target-progress-fill').style.width = `${(s.score % step) / step * 100}%`;
            this.$('goal-bar').classList.remove('reached');
        }
        this.tweenScore();
    }

    tweenScore() {
        cancelAnimationFrame(this._tw);
        const el = this.$('display-score');
        const step = () => {
            const diff = this.state.score - this.shownScore;
            if (Math.abs(diff) < 1) { this.shownScore = this.state.score; el.textContent = this.shownScore.toLocaleString(); return; }
            this.shownScore += Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.18);
            el.textContent = Math.round(this.shownScore).toLocaleString();
            this._tw = requestAnimationFrame(step);
        };
        step();
    }

    updateFooterInfo() {
        const left = this.board.countRemaining();
        const endless = this.state.mode === 'endless';
        this.$('footer-stage-info').classList.toggle('hidden', endless);
        this.$('footer-endless-info').classList.toggle('hidden', !endless);
        this.$('footer-endless-info').textContent = `空位 ${100 - left} · 消除后补一层\n每 5,000 分获饼干或抽奖券`;
        this.$('info-left').textContent = left;
        this.$('info-bonus').textContent = ScoringSystem.calculateClearanceBonus(left);
    }

    shake() {
        const app = this.$('game-app');
        app.classList.remove('shake');
        void app.offsetWidth;
        app.classList.add('shake');
    }

    saveState() {
        // Persist only complete turns: reloading mid-animation cannot duplicate points/rewards.
        if (this.state.mode === 'endless' && this.board?.isAnimating) return;
        if (this.state.runFailed) {
            this.state.hasSavedGame = false;
            this.state.board = null;
            StorageManager.saveGame(this.state);
            return;
        }
        if (!this.board || !this.board.grid.length) return;
        this.state.hasSavedGame = true;
        this.state.board = this.board.grid.map(row => [...row]);
        StorageManager.saveGame(this.state);
    }

    // ---------- 流程 ----------
    isEndlessFull() {
        return this.state.mode === 'endless' && this.board.countRemaining() === this.board.rows * this.board.cols;
    }

    onBoardStateChanged() {
        this.saveState();
        this.updateFooterInfo();
        clearTimeout(this.settlementTimer);
        const full = this.isEndlessFull();
        if (full && this.playing && !this.state.settled && !this.board.isAnimating) {
            this.handleSettlement();
            return;
        }
        if (full || !this.board.hasValidMoves()) {
            if (this.state.settled) return;
            this.settlementTimer = setTimeout(() => {
                if (!this.playing || this.state.settled) return;
                if (!this.isEndlessFull() && this.board.hasValidMoves()) return;
                if (this.board.isAnimating || this.propsManager.isChoosingTool() ||
                    !this.$('menu-modal').classList.contains('hidden') ||
                    !this.$('settings-modal').classList.contains('hidden') ||
                    !this.$('leaderboard-modal').classList.contains('hidden')) {
                    this.onBoardStateChanged();
                    return;
                }
                // Filling the board ends the run even if a pair or a tool remains.
                if (!this.isEndlessFull() && this.state.mode === 'endless' &&
                    (this.state.wands > 0 || this.state.magicWands > 0 || this.state.fishBiscuits >= PropsManager.PRICE)) {
                    this.$('endless-rescue-modal').classList.remove('hidden');
                } else this.handleSettlement();
            }, 700);
        } else {
            this.$('endless-rescue-modal').classList.add('hidden');
        }
    }

    awardPersonalRecord(mode) {
        const s = this.state;
        if (!s.settled || !s.runFailed) return;
        const bestKey = mode === 'endless' ? 'endlessBest' : 'highScore';
        const oldBest = Math.max(s[bestKey] || 0, StorageManager.getPersonalBest(mode));
        if (s.personalRecordReward || s.score <= 0 || s.score <= oldBest) return;
        const magic = Math.random() < .5;
        const field = magic ? 'magicWands' : 'wands';
        s[field] += 1;
        s.personalRecordReward = { name: magic ? '魔法棒' : '染色棒', field, score: s.score };
    }

    showPersonalRecordReward() {
        const reward = this.state.runFailed ? this.state.personalRecordReward : null;
        const banner = this.$('personal-record-banner');
        banner.classList.toggle('hidden', !reward);
        banner.textContent = reward ? `恭喜刷新个人纪录！\n随机获得 ${reward.name} ×1` : '';
    }

    handleEndlessSettlement() {
        if (!this.playing || this.state.settled || this.board.isAnimating) return;
        this.propsManager.cancelTool();
        this.$('endless-rescue-modal').classList.add('hidden');
        this.state.settled = true;
        this.state.runFailed = true;
        this.awardPersonalRecord('endless');
        this.propsManager.updateUI();
        this.state.endlessBest = Math.max(this.state.endlessBest || 0, this.state.score);
        StorageManager.recordEndlessScore(this.state.score);
        this.shownScore = this.state.score;
        this.updateHeaderUI();
        this.saveState();
        this.showEndlessSettlement();
    }

    showEndlessSettlement() {
        const s = this.state;
        this.showPersonalRecordReward();
        this.$('settlement-heading').textContent = '无尽模式';
        this.$('settlement-title').textContent = this.isEndlessFull() ? '棋盘满啦' : '本轮结束';
        this.$('settlement-title').className = 'settle-stamp fail';
        this.$('settlement-base').textContent = s.score.toLocaleString();
        this.$('settlement-base').previousElementSibling.textContent = '消除得分';
        this.$('settlement-remaining').textContent = `${this.board.countRemaining()} 只`;
        this.$('settlement-final-score').textContent = s.score.toLocaleString();
        this.$('settlement-bonus').parentElement.classList.add('hidden');
        this.$('settlement-goal').parentElement.classList.add('hidden');
        this.$('settlement-reward').textContent = `本轮已获得 小鱼饼干 ×${s.endlessRewarded}${s.endlessTicketRewards ? ' + 抽奖券奖励' : ''} · 最高 ${(s.endlessBest || 0).toLocaleString()} 分`;
        const next = this.$('settlement-next-btn');
        next.textContent = '再来一局 · 无尽模式';
        next.className = 'btn go';
        next.onclick = () => { this.$('settlement-modal').classList.add('hidden'); this.newEndlessGame(); };
        this.playFailureFeedback();
        this.$('settlement-modal').classList.remove('hidden');
    }

    playFailureFeedback() {
        // A personal best still earns its reward, but a lost run never celebrates.
        document.querySelectorAll('.confetti-piece').forEach(piece => piece.remove());
        window.sounds.playLose();
    }

    handleSettlement() {
        if (!this.playing || this.state.settled || this.board.isAnimating || (!this.isEndlessFull() && this.board.hasValidMoves())) return;
        this.propsManager.cancelTool();
        if (this.state.mode === 'endless') { this.handleEndlessSettlement(); return; }
        const bonus = ScoringSystem.calculateClearanceBonus(this.board.countRemaining());
        this.state.settled = true;
        this.state.settleBonus = bonus;
        this.state.baseScore = this.state.score;
        this.state.score += bonus;
        this.shownScore = this.state.score;
        const passed = this.state.score >= this.state.targetScore;
        this.state.runFailed = !passed;
        this.state.settleReward = passed ? ScoringSystem.getStageReward(this.state.stage) : null;
        if (passed) {
            const reward = this.state.settleReward;
            this.state.fishBiscuits += reward.fishBiscuits + (reward.extraBiscuits || 0);
            this.state.lotteryTickets += reward.lotteryTickets || 0;
            this.state.wands += reward.wands;
            this.state.magicWands += reward.magicWands;
        }
        // A stage clear continues this run; compare and record its total only on failure.
        if (!passed) {
            this.awardPersonalRecord('stage');
            this.state.highScore = Math.max(this.state.highScore || 0, this.state.score);
            StorageManager.recordScore(this.state.score, this.state.stage);
        }
        this.propsManager.updateUI();
        this.saveState();
        this.updateHeaderUI();
        this.showSettlement(bonus);
    }

    showSettlement(bonus) {
        if (this.state.mode === 'endless') { this.showEndlessSettlement(); return; }
        this.showPersonalRecordReward();
        this.$('settlement-bonus').parentElement.classList.remove('hidden');
        this.$('settlement-goal').parentElement.classList.remove('hidden');
        const s = this.state;
        const passed = s.score >= s.targetScore;
        const remaining = this.board.countRemaining();
        this.$('settlement-base').textContent = (s.score - bonus).toLocaleString();
        this.$('settlement-base').previousElementSibling.textContent = '累计消除得分';
        this.$('settlement-remaining').textContent = `${remaining} 只`;
        this.$('settlement-bonus').textContent = `+${bonus.toLocaleString()}`;
        this.$('settlement-final-score').textContent = s.score.toLocaleString();
        this.$('settlement-goal').textContent = s.targetScore.toLocaleString();
        this.$('settlement-heading').textContent = `第 ${s.stage} 关`;

        const stamp = this.$('settlement-title');
        const next = this.$('settlement-next-btn');
        stamp.textContent = passed ? (s.stage % 5 === 0 ? `${s.stage} 关达成！` : '通关！') : '本轮结束';
        stamp.className = `settle-stamp ${passed ? 'pass' : 'fail'}`;
        if (passed) {
            const reward = s.settleReward || { fishBiscuits: 1, wands: 0, magicWands: 0 };
            const parts = [];
            const biscuits = reward.fishBiscuits + (reward.extraBiscuits || 0);
            if (biscuits) parts.push(`小鱼饼干 ×${biscuits}`);
            if (reward.lotteryTickets) parts.push('抽奖券 ×1');
            if (reward.wands) parts.push(`染色棒 ×${reward.wands}`);
            if (reward.magicWands) parts.push(`魔法棒 ×${reward.magicWands}`);
            this.$('settlement-reward').textContent = `获得 ${parts.join(' + ')}`;
        } else {
            this.$('settlement-reward').textContent = `还差 ${(s.targetScore - s.score).toLocaleString()} 分 · 下一轮从第 1 关开始`;
        }
        next.textContent = passed ? '进入下一关' : '从第 1 关重新开始';
        next.className = `btn ${passed ? 'go' : 'warn'}`;
        next.onclick = () => {
            this.$('settlement-modal').classList.add('hidden');
            if (passed) {
                this.state.stage += 1;
                this.propsManager.showToast(`第 ${this.state.stage} 关`);
                this.startStage(this.state.score);
            } else {
                this.newGame();
            }
        };

        if (passed) { window.sounds.playLevelClear(); this.effects.spawnConfetti(); }
        else this.playFailureFeedback();
        this.$('settlement-modal').classList.remove('hidden');
    }
}

window.addEventListener('DOMContentLoaded', () => { window.game = new PopCatGame(); });

// Stop decorative animations while the document is not visible.
document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('page-backgrounded', document.hidden);
});

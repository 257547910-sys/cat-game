// 存档、货币、排行榜（本地）
class StorageManager {
    static STORAGE_KEY = 'popcat_beach_save_v1';
    static LEADERBOARD_KEY = 'popcat_beach_leaderboard_v2';
    static ENDLESS_LEADERBOARD_KEY = 'popcat_beach_endless_leaderboard_v1';

    static getDefaultState() {
        return {
            mode: 'stage',
            modeSaves: { stage: null, endless: null },
            endlessRewarded: 0,
            endlessTicketRewards: 0,
            endlessRewardCheckpoint: 0,
            personalRecordReward: null,
            endlessBest: 0,
            stage: 1,
            score: 0,
            targetScore: 1000,
            stageStartScore: 0,
            stageRulesVersion: 2,
            fishBiscuits: 5,
            lotteryTickets: 0,
            dailyTicketDate: null,
            wands: 1,
            magicWands: 0,
            board: null,
            theme: 'summer',
            catPalette: 0,
            coatVersion: 2,
            soundEnabled: true,
            vibrationEnabled: true,
            musicVolume: 0.55,
            sfxVolume: 0.75,
            highScore: 0,
            hasSavedGame: false,
            settled: false,
            runFailed: false,
            settleReward: null,
            settleBonus: 0,
            lastWheelDate: null
        };
    }

    static loadGame() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return this.getDefaultState();
            const saved = JSON.parse(raw);
            const state = { ...this.getDefaultState(), ...saved };
            if (saved.soundEnabled === false) {
                if (saved.musicVolume == null) state.musicVolume = 0;
                if (saved.sfxVolume == null) state.sfxVolume = 0;
            }
            if (saved.coatVersion !== 2) {
                state.catPalette = 0;
                state.coatVersion = 2;
            }
            // Preserve old payouts while applying the new interval only to future milestones.
            if (!Number.isInteger(saved.endlessRewardCheckpoint) || saved.endlessRewardCheckpoint < 0) {
                state.endlessRewardCheckpoint = state.mode === 'endless'
                    ? Math.floor(Math.max(0, state.score) / ScoringSystem.ENDLESS_REWARD_STEP) : 0;
            }
            state.modeSaves = {
                stage: this.getSavedRun({ modeSaves: saved.modeSaves }, 'stage'),
                endless: this.getSavedRun({ modeSaves: saved.modeSaves }, 'endless')
            };
            // Import the former single active save into its own mode without losing the other slot.
            this.syncModeSave(state);
            // Former per-board scores cannot be interpreted as a cumulative run.
            // Retain shared inventory/preferences and any independent endless progress.
            if (saved.stageRulesVersion !== 2) {
                state.modeSaves.stage = null;
                if (state.mode !== 'endless') Object.assign(state, this.resetRun(state));
                state.stageRulesVersion = 2;
            }
            // Old failed saves cannot resume the lost stage, either.
            if (state.runFailed || (state.mode !== 'endless' && state.settled && state.score < state.targetScore)) {
                return this.resetRun(state);
            }
            return state;
        } catch (e) {
            return this.getDefaultState();
        }
    }

    static resetRun(state) {
        return {
            ...state,
            mode: 'stage', endlessRewarded: 0, endlessTicketRewards: 0, endlessRewardCheckpoint: 0, personalRecordReward: null,
            stageStartScore: 0, stageRulesVersion: 2,
            stage: 1, score: 0, targetScore: ScoringSystem.getTargetScore(1),
            board: null, hasSavedGame: false, settled: false, runFailed: false,
            settleBonus: 0, baseScore: 0, settleReward: null
        };
    }

    static RUN_KEYS = [
        'mode', 'stage', 'score', 'targetScore', 'stageStartScore', 'stageRulesVersion', 'board', 'hasSavedGame', 'settled',
        'runFailed', 'settleReward', 'settleBonus', 'baseScore', 'personalRecordReward',
        'endlessRewarded', 'endlessTicketRewards', 'endlessRewardCheckpoint'
    ];

    static getSavedRun(state, mode) {
        const run = state.modeSaves?.[mode];
        if (!run || run.mode !== mode || !run.hasSavedGame || run.runFailed) return null;
        if (run.settled && (mode === 'endless' || run.score < run.targetScore)) return null;
        if (!Array.isArray(run.board) || run.board.length !== 10 ||
            !run.board.every(row => Array.isArray(row) && row.length === 10 &&
                row.every(id => id === null || (Number.isInteger(id) && id >= 0 && id < 5)))) return null;
        return JSON.parse(JSON.stringify(run));
    }

    static syncModeSave(state) {
        if (!state.modeSaves || typeof state.modeSaves !== 'object') state.modeSaves = { stage: null, endless: null };
        const mode = state.mode === 'endless' ? 'endless' : 'stage';
        if (state.runFailed || (state.settled && (mode === 'endless' || state.score < state.targetScore))) {
            state.modeSaves[mode] = null;
        } else if (state.hasSavedGame && state.board) {
            const run = Object.fromEntries(this.RUN_KEYS.filter(key => state[key] !== undefined).map(key => [key, state[key]]));
            state.modeSaves[mode] = this.getSavedRun({ modeSaves: { [mode]: run } }, mode);
        }
    }

    static saveGame(state) {
        this.syncModeSave(state);
        try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
    }

    static isPersonalEntry(entry) {
        return entry.isUser === true || entry.name === '我';
    }

    // Migrate historical duplicates on read, and retain the personal best even below the top 20.
    static normalizeLeaderboard(list) {
        if (!Array.isArray(list)) return [];
        const valid = list.filter(it => it && Number.isFinite(it.score) && it.score > 0);
        const personal = valid.filter(it => this.isPersonalEntry(it))
            .sort((a, b) => b.score - a.score)[0];
        const entries = valid.filter(it => !this.isPersonalEntry(it));
        if (personal) entries.push({ ...personal, name: '我', isUser: true });
        entries.sort((a, b) => b.score - a.score);
        return entries.map((it, i) => ({ ...it, rank: i + 1 }))
            .filter((it, i) => i < 20 || this.isPersonalEntry(it));
    }

    static getLeaderboard() {
        let list;
        try {
            const raw = localStorage.getItem(this.LEADERBOARD_KEY);
            if (raw) list = JSON.parse(raw);
        } catch (e) {}
        if (!Array.isArray(list)) {
            list = [
                ['喵星大帝', 98520, 24], ['三花本花', 84300, 21], ['沙滩小金渐层', 71200, 18], ['橘猫吃不饱', 58900, 15],
                ['PopCat_Pro', 46250, 12], ['薄荷小奶猫', 38100, 10], ['拾贝的人', 29400, 8], ['布偶泡泡', 21500, 6]
            ].map(([name, score, stage]) => ({ name, score, stage, date: '' }));
        }
        const ranked = this.normalizeLeaderboard(list);
        try { localStorage.setItem(this.LEADERBOARD_KEY, JSON.stringify(ranked)); } catch (e) {}
        return ranked;
    }

    static getEndlessLeaderboard() {
        let list = [];
        try { list = JSON.parse(localStorage.getItem(this.ENDLESS_LEADERBOARD_KEY) || '[]'); } catch (e) {}
        const ranked = this.normalizeLeaderboard(list);
        try { localStorage.setItem(this.ENDLESS_LEADERBOARD_KEY, JSON.stringify(ranked)); } catch (e) {}
        return ranked;
    }

    static getPersonalBest(mode) {
        const list = mode === 'endless' ? this.getEndlessLeaderboard() : this.getLeaderboard();
        return list.find(it => this.isPersonalEntry(it))?.score || 0;
    }

    static recordEndlessScore(score) {
        return this.recordPersonalScore('endless', score);
    }

    static recordScore(score, stage) {
        return this.recordPersonalScore('stage', score, stage);
    }

    static recordPersonalScore(mode, score, stage) {
        const list = mode === 'endless' ? this.getEndlessLeaderboard() : this.getLeaderboard();
        if (!Number.isFinite(score) || score <= 0) return list;
        const best = list.find(it => this.isPersonalEntry(it));
        if (best && score <= best.score) return list;
        const entry = { name: '我', score, date: new Date().toLocaleDateString('zh-CN'), isUser: true };
        if (mode !== 'endless') entry.stage = stage;
        const ranked = this.normalizeLeaderboard([...list.filter(it => !this.isPersonalEntry(it)), entry]);
        const key = mode === 'endless' ? this.ENDLESS_LEADERBOARD_KEY : this.LEADERBOARD_KEY;
        try { localStorage.setItem(key, JSON.stringify(ranked)); } catch (e) {}
        return ranked;
    }
}

window.StorageManager = StorageManager;

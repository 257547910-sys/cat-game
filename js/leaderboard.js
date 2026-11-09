// Two local leaderboards keep stage results and endless totals separate.
class LeaderboardUI {
    constructor(game) {
        this.game = game;
        this.mode = 'stage';
        this.modal = document.getElementById('leaderboard-modal');
        this.listEl = document.getElementById('leaderboard-list');
        this.tabs = ['stage', 'endless'].map(mode => document.getElementById(`rank-${mode}-tab`));
        this.tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => this.select(index ? 'endless' : 'stage'));
            tab.addEventListener('keydown', event => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
                this.select(next ? 'endless' : 'stage');
                this.tabs[next].focus();
            });
        });
        document.getElementById('btn-open-rank').addEventListener('click', () => this.open());
        document.getElementById('leaderboard-close-btn').addEventListener('click', () => this.close());
    }

    open() {
        this.select(this.game.state.mode === 'endless' ? 'endless' : 'stage');
        this.modal.classList.remove('hidden');
    }

    close() { this.modal.classList.add('hidden'); }

    select(mode) {
        this.mode = mode;
        this.tabs.forEach((tab, i) => {
            const active = mode === (i ? 'endless' : 'stage');
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        });
        this.listEl.setAttribute('aria-labelledby', `rank-${mode}-tab`);
        this.render();
    }

    render() {
        const endless = this.mode === 'endless';
        const list = endless ? StorageManager.getEndlessLeaderboard() : StorageManager.getLeaderboard();
        this.listEl.replaceChildren();
        if (!list.length) {
            const empty = document.createElement('p');
            empty.className = 'modal-desc';
            empty.textContent = '还没有成绩，来创造第一条无尽纪录吧！';
            this.listEl.appendChild(empty);
        }
        list.forEach(it => {
            const item = document.createElement('div');
            item.className = `leaderboard-item ${it.isUser ? 'is-user-item' : ''}`;
            const rank = document.createElement('div');
            rank.className = `lb-rank r${it.rank}`;
            rank.textContent = it.rank;
            const info = document.createElement('div');
            info.className = 'lb-info';
            const name = document.createElement('div');
            name.className = 'lb-name';
            name.textContent = it.name;
            const details = document.createElement('div');
            details.className = 'lb-stage';
            details.textContent = (endless ? '无尽模式' : `第 ${it.stage || 1} 关`) + (it.date ? ` · ${it.date}` : '');
            info.append(name, details);
            const score = document.createElement('div');
            score.className = 'lb-score';
            score.textContent = (it.score || 0).toLocaleString();
            item.append(rank, info, score);
            this.listEl.appendChild(item);
        });
    }
}
window.LeaderboardUI = LeaderboardUI;

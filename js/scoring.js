// 保留平方计分和收尾奖励，前期缓升，后期逐渐加压。
class ScoringSystem {
    // 单次消除 = 数量² × 5
    static calculateEliminationScore(count) {
        return count < 2 ? 0 : count * count * 5;
    }

    // 收尾奖励 = 2000 − 剩余² × 20，剩余 ≥10 只为 0
    static calculateClearanceBonus(remaining) {
        if (remaining >= 10) return 0;
        return Math.max(0, 2000 - remaining * remaining * 20);
    }

    // 每关的通关目标分（本关单局总分）
    static getTargetScore(stage) {
        const level = Number.isFinite(stage) ? Math.max(1, Math.floor(stage)) : 1;
        return 1000 + (level - 1) * 2000;
    }

    // Only opening boards get this small clustering assist; played boards never change secretly.
    static getOpeningClusterChance(stage) {
        return 0;
    }

    static rollBasicReward() {
        return Math.random() < .9 ? { fishBiscuits: 1, lotteryTickets: 0 }
            : { fishBiscuits: 0, lotteryTickets: 1 };
    }

    static getStageReward(stage) {
        const milestone = stage % 5 === 0;
        return {
            ...this.rollBasicReward(),
            extraBiscuits: milestone ? 2 : 0,
            wands: milestone && stage % 10 !== 0 ? 1 : 0,
            magicWands: milestone && stage % 10 === 0 ? 1 : 0
        };
    }

    static ENDLESS_REWARD_STEP = 5000;

    // Ratios alone drive replenishment; no extra colors or neighbor manipulation.
    static getEndlessWeights(counts, score) {
        const total = counts.reduce((a, b) => a + b, 0);
        const mean = Math.max(1, total / 5);
        const pressure = Math.min(9, .35 + Math.max(0, score) / 1500);
        const weights = counts.map(n => Math.exp(Math.max(-30, Math.min(30, pressure * (mean - n) / mean))));
        const sum = weights.reduce((a, b) => a + b, 0);
        return weights.map(w => w / sum);
    }

    static getPraise(count) {
        if (count >= 16) return { text: '神级消除', className: 'praise-godlike' };
        if (count >= 12) return { text: '太强了', className: 'praise-awesome' };
        if (count >= 8) return { text: '很棒', className: 'praise-great' };
        if (count >= 5) return { text: '不错', className: 'praise-good' };
        return null;
    }
}

window.ScoringSystem = ScoringSystem;

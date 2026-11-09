// Level Mode Expansion Module
// This module provides a complete Level / Campaign mode framework for future updates.
class LevelModeManager {
    constructor(game) {
        this.game = game;
        this.stages = [];
        this.currentStageId = 1;
        this.unlockedStage = 1;
        this.stageStars = {}; // { stageId: starsEarned (1..3) }
        this.loadStages();
    }

    async loadStages() {
        try {
            const resp = await fetch('levels/stages_config.json');
            const data = await resp.json();
            this.stages = data.stages || [];
        } catch (e) {
            console.warn('Could not load stages_config.json, using fallback', e);
        }
    }

    getStage(stageId) {
        return this.stages.find(s => s.stageId === stageId);
    }

    calculateStars(stageId, score) {
        const stage = this.getStage(stageId);
        if (!stage) return 1;
        const [s1, s2, s3] = stage.stars;
        if (score >= s3) return 3;
        if (score >= s2) return 2;
        if (score >= s1) return 1;
        return 0;
    }

    completeStage(stageId, finalScore) {
        const stars = this.calculateStars(stageId, finalScore);
        if (stars > (this.stageStars[stageId] || 0)) {
            this.stageStars[stageId] = stars;
        }
        if (stageId === this.unlockedStage && this.unlockedStage < this.stages.length) {
            this.unlockedStage++;
        }
        this.saveLevelProgress();
        return stars;
    }

    saveLevelProgress() {
        localStorage.setItem('popcat_levels_progress', JSON.stringify({
            unlockedStage: this.unlockedStage,
            stageStars: this.stageStars
        }));
    }

    loadLevelProgress() {
        try {
            const saved = localStorage.getItem('popcat_levels_progress');
            if (saved) {
                const data = JSON.parse(saved);
                this.unlockedStage = data.unlockedStage || 1;
                this.stageStars = data.stageStars || {};
            }
        } catch (e) {}
    }
}

window.LevelModeManager = LevelModeManager;

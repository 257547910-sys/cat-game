// Web Audio API Sound & BGM Engine for 欢乐碰碰猫 · 海滩物语
// Includes:
// 1. Cozy Beach Bossa Nova / Island Marimba & Ukulele BGM (procedural lookahead sequencer)
// 2. Crisp multi-bubble elimination sounds + chord sparkles
// 3. Expressive dual-formant cat meows (occasional during gameplay & eliminations)
// 4. Joyful celebration fanfare + confetti popper + happy meow on stage clear
// 5. Dejected descending wah-wah + sad kitten whimper on stage fail
// 6. Independent BGM volume & SFX volume controls

class SoundManager {
    constructor() {
        this.ctx = null;
        this.masterCompressor = null;
        this.bgmGain = null;
        this.sfxGain = null;
        this.bgmDelay = null;

        // Volume & Mute States
        this.bgmVolume = 0.70;
        this.sfxVolume = 0.85;
        this.bgmMuted = false;
        this.sfxMuted = false;

        // Legacy compatibility property
        this.enabled = true;

        // BGM Sequencer State
        this.bgmPlaying = false;
        this.bgmTimer = null;
        this.current16thStep = 0;
        this.nextNoteTime = 0;
        this.tempo = 106; // Relaxed sunny beach Bossa Nova tempo

        // Ambient & Occasional Meow State
        this.ambientActive = false;
        this.lastPreviewTime = 0;

        this.init();
    }

    init() {
        if (!(window.AudioContext || window.webkitAudioContext)) return;
        const unlock = () => this.recoverAudio(true);
        ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'].forEach(type => {
            window.addEventListener(type, unlock, { passive: true, capture: true });
        });
        const background = () => {
            this.foreground = false;
            this.stopBgmScheduler();
            if (this.ctx && this.ctx.state === 'running') {
                try { Promise.resolve(this.ctx.suspend()).catch(() => {}); } catch (e) {}
            }
        };
        const foreground = () => {
            if (document.hidden) return;
            this.foreground = true;
            this.recoverAudio(false);
            clearTimeout(this.foregroundRetry);
            this.foregroundRetry = setTimeout(() => this.recoverAudio(false), 450);
        };
        this.foreground = !document.hidden;
        document.addEventListener('visibilitychange', () => document.hidden ? background() : foreground());
        window.addEventListener('pagehide', background);
        window.addEventListener('pageshow', foreground);
        window.addEventListener('focus', foreground);
        // WeChat signals when its media environment becomes available.
        document.addEventListener('WeixinJSBridgeReady', foreground);
        document.addEventListener('DOMContentLoaded', foreground);
        // Try autoplay when allowed; the first touch unlocks restricted browsers.
        setTimeout(foreground, 0);
        document.addEventListener('click', event => {
            if (!event.target.closest?.('#title-screen button, #title-cats img')) return;
            this.recoverAudio(true);
            if (this.ctx?.state === 'running') this.playMenuTap();
        }, true);
        this.audioWatchdog = setInterval(() => {
            if (document.hidden || !this.foreground || !this.ctx) return;
            if (this.ctx.state !== 'running') { this.recoverAudio(false); return; }
            const time = this.ctx.currentTime;
            if (this.lastClock === time) this.stalledChecks = (this.stalledChecks || 0) + 1;
            else this.stalledChecks = 0;
            this.lastClock = time;
            if (this.stalledChecks >= 2) this.needsRebuild = true;
        }, 1500);
    }

    stopBgmScheduler() {
        clearInterval(this.bgmTimer);
        this.bgmTimer = null;
        this.bgmPlaying = false;
    }

    discardContext() {
        const old = this.ctx;
        this.stopBgmScheduler();
        if (old) {
            old.onstatechange = null;
            try { Promise.resolve(old.close()).catch(() => {}); } catch (e) {}
        }
        this.ctx = null;
        this.masterCompressor = this.bgmGain = this.sfxGain = this.bgmDelay = null;
        this.resumePending = null;
        clearTimeout(this.resumeTimeout);
        this.nextMeow = 0;
        this.needsRebuild = false;
        this.stalledChecks = 0;
        this.lastClock = null;
    }

    recoverAudio(gesture = false) {
        if (document.hidden || this.foreground === false) return;
        try {
            if (this.ctx?.state === 'closed' || (gesture && this.needsRebuild)) this.discardContext();
            const ctx = this.ensureCtx();
            if (!ctx) return;
            if (ctx.state === 'running') { this.audioReady(ctx); return; }
            // A fresh real interaction retries even if a previous resume promise never settled.
            if (this.resumePending === ctx && !gesture) return;
            this.resumePending = ctx;
            const ready = () => {
                if (this.ctx !== ctx) return;
                if (this.resumePending === ctx) this.resumePending = null;
                if (ctx.state === 'running') this.audioReady(ctx);
            };
            // Includes iOS's interrupted state, not only suspended.
            Promise.resolve(ctx.resume()).then(ready).catch(() => {
                if (this.ctx === ctx) { this.resumePending = null; this.needsRebuild = true; }
            });
            clearTimeout(this.resumeTimeout);
            this.resumeTimeout = setTimeout(() => {
                if (this.ctx !== ctx || document.hidden) return;
                this.resumePending = null;
                if (ctx.state !== 'running') this.needsRebuild = true;
            }, 1200);
        } catch (e) { this.needsRebuild = true; }
    }

    audioReady(ctx) {
        if (this.ctx !== ctx || document.hidden || this.foreground === false || ctx.state !== 'running') return;
        clearTimeout(this.resumeTimeout);
        this.needsRebuild = false;
        this.updateGainNodes();
        if (!this.bgmPlaying || !this.bgmTimer) this.startBgm();
        this.startAmbientLoop();
        if (!this.titleGreeted && document.getElementById('title-screen') &&
            !document.getElementById('title-screen').classList.contains('hidden')) {
            this.titleGreeted = true;
            this.playHomeWelcome();
        }
    }

    playMenuTap() {
        if (!this.canPlaySfx() || this.ctx?.state !== 'running') return;
        this.playUiNote(740, this.ctx.currentTime, .08, .07);
        this.playUiNote(990, this.ctx.currentTime + .035, .10, .035);
    }

    playUiNote(freq, time, duration, volume) {
        const ctx = this.ctx;
        if (!ctx || ctx.state !== 'running') return;
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);
        gain.gain.setValueAtTime(.0001, time);
        gain.gain.linearRampToValueAtTime(volume, time + .008);
        gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
        osc.connect(gain); gain.connect(this.sfxGain);
        osc.start(time); osc.stop(time + duration + .02);
    }

    playHomeWelcome() {
        if (!this.canPlaySfx() || this.ctx?.state !== 'running') return;
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) =>
            this.playUiNote(freq, this.ctx.currentTime + index * .10, .30, .075));
    }

    ensureCtx() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return null;
            this.ctx = new AudioContext();

            // Master compressor for warm, clip-free output
            this.masterCompressor = this.ctx.createDynamicsCompressor();
            this.masterCompressor.threshold.setValueAtTime(-14, this.ctx.currentTime);
            this.masterCompressor.knee.setValueAtTime(18, this.ctx.currentTime);
            this.masterCompressor.ratio.setValueAtTime(4, this.ctx.currentTime);
            this.masterCompressor.attack.setValueAtTime(0.005, this.ctx.currentTime);
            this.masterCompressor.release.setValueAtTime(0.18, this.ctx.currentTime);
            this.masterCompressor.connect(this.ctx.destination);

            // BGM Master Gain
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.setValueAtTime(this.getEffectiveBgmGain(), this.ctx.currentTime);
            this.bgmGain.connect(this.masterCompressor);

            // Warm Echo Delay Bus for BGM Melody & Chords
            this.bgmDelay = this.ctx.createDelay(1.0);
            this.bgmDelay.delayTime.setValueAtTime((60 / this.tempo) * 0.75, this.ctx.currentTime); // dotted 8th echo
            const delayFilter = this.ctx.createBiquadFilter();
            delayFilter.type = 'lowpass';
            delayFilter.frequency.setValueAtTime(1650, this.ctx.currentTime);
            const delayFeedback = this.ctx.createGain();
            delayFeedback.gain.setValueAtTime(0.22, this.ctx.currentTime);
            const delayWet = this.ctx.createGain();
            delayWet.gain.setValueAtTime(0.18, this.ctx.currentTime);

            this.bgmDelay.connect(delayFilter);
            delayFilter.connect(delayFeedback);
            delayFeedback.connect(this.bgmDelay);
            delayFilter.connect(delayWet);
            delayWet.connect(this.bgmGain);

            // SFX Master Gain
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.setValueAtTime(this.getEffectiveSfxGain(), this.ctx.currentTime);
            this.sfxGain.connect(this.masterCompressor);
            const ctx = this.ctx;
            ctx.onstatechange = () => {
                if (this.ctx !== ctx || document.hidden || this.foreground === false) return;
                if (ctx.state === 'running') this.audioReady(ctx);
                else if (ctx.state === 'interrupted' || ctx.state === 'suspended') {
                    this.stopBgmScheduler();
                    clearTimeout(this.stateRetry);
                    this.stateRetry = setTimeout(() => this.recoverAudio(false), 80);
                } else if (ctx.state === 'closed') this.needsRebuild = true;
            };
        }
        return this.ctx;
    }

    // Settings UI uses musicVolume; retain the engine's BGM naming internally.
    get musicVolume() { return this.bgmVolume; }
    set musicVolume(value) { this.bgmVolume = value; }
    get musicBus() { return this.bgmGain; }
    get sfxBus() { return this.sfxGain; }

    configure(music, sfx) {
        const clamp = (value, fallback) => typeof value === 'number' && Number.isFinite(value)
            ? Math.max(0, Math.min(1, value)) : fallback;
        this.enabled = true;
        this.applySettings({ bgmVolume: clamp(music, 0.55), sfxVolume: clamp(sfx, 0.75), bgmMuted: false, sfxMuted: false });
    }

    applyVolumes() { this.updateGainNodes(); }

    maybeMeow(variant = 'kitten') {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        const chance = variant === 'big' ? 0.75 : 0.38;
        if (!ctx || ctx.currentTime < (this.nextMeow || 0) || Math.random() > chance) return;
        this.nextMeow = ctx.currentTime + 6;
        setTimeout(() => this.playCatMeow(variant), 80);
    }

    getEffectiveBgmGain() {
        if (this.bgmMuted || !this.enabled) return 0;
        return Math.max(0, Math.min(1, this.bgmVolume) * 0.58);
    }

    getEffectiveSfxGain() {
        if (this.sfxMuted || !this.enabled) return 0;
        return Math.max(0, Math.min(1, this.sfxVolume) * 1.0);
    }

    applySettings({ bgmVolume, sfxVolume, bgmMuted, sfxMuted }) {
        if (typeof bgmVolume === 'number') this.bgmVolume = Math.max(0, Math.min(1, bgmVolume));
        if (typeof sfxVolume === 'number') this.sfxVolume = Math.max(0, Math.min(1, sfxVolume));
        if (typeof bgmMuted === 'boolean') this.bgmMuted = bgmMuted;
        if (typeof sfxMuted === 'boolean') this.sfxMuted = sfxMuted;
        this.updateGainNodes();
    }

    setBgmVolume(val) {
        this.bgmVolume = Math.max(0, Math.min(1, val));
        if (this.bgmVolume > 0 && this.bgmMuted) this.bgmMuted = false;
        this.ensureCtx();
        this.startBgm();
        this.updateGainNodes();
    }

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        if (this.sfxVolume > 0 && this.sfxMuted) this.sfxMuted = false;
        this.ensureCtx();
        this.updateGainNodes();
    }

    toggleBgmMute() {
        this.bgmMuted = !this.bgmMuted;
        this.ensureCtx();
        this.startBgm();
        this.updateGainNodes();
        return !this.bgmMuted;
    }

    toggleSfxMute() {
        this.sfxMuted = !this.sfxMuted;
        this.ensureCtx();
        this.updateGainNodes();
        return !this.sfxMuted;
    }

    updateGainNodes() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        if (this.bgmGain) {
            this.bgmGain.gain.cancelScheduledValues(now);
            if (this.getEffectiveBgmGain() === 0) this.bgmGain.gain.setValueAtTime(0, now);
            else this.bgmGain.gain.setTargetAtTime(this.getEffectiveBgmGain(), now, 0.03);
        }
        if (this.sfxGain) {
            this.sfxGain.gain.cancelScheduledValues(now);
            if (this.getEffectiveSfxGain() === 0) this.sfxGain.gain.setValueAtTime(0, now);
            else this.sfxGain.gain.setTargetAtTime(this.getEffectiveSfxGain(), now, 0.02);
        }
    }

    canPlaySfx() {
        return this.enabled && !this.sfxMuted && this.sfxVolume > 0.005;
    }

    // =========================================================================
    // 1. PROCEDURAL BEACH BOSSA NOVA & MARIMBA BGM ("阳光海滩物语")
    // =========================================================================

    midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    startBgm() {
        if (this.bgmPlaying) return;
        const ctx = this.ensureCtx();
        if (!ctx || ctx.state !== 'running' || document.hidden || this.foreground === false) return;

        this.bgmPlaying = true;
        this.current16thStep = 0;
        this.nextNoteTime = ctx.currentTime + 0.08;

        const scheduleAheadTime = 0.22; // seconds
        const lookaheadMs = 60; // ms

        this.bgmTimer = setInterval(() => {
            if (!this.ctx || this.ctx.state !== 'running' || document.hidden) return;
            // If time drifted (e.g. tab backgrounded), resync
            if (this.nextNoteTime < this.ctx.currentTime - 0.3) {
                this.nextNoteTime = this.ctx.currentTime + 0.05;
            }
            while (this.nextNoteTime < this.ctx.currentTime + scheduleAheadTime) {
                this.scheduleBgmStep(this.current16thStep, this.nextNoteTime);
                const secondsPer16th = 60.0 / this.tempo / 4.0;
                // Subtle swing on even/odd 16th steps for breezy island groove
                const swing = (this.current16thStep % 2 === 0) ? 1.06 : 0.94;
                this.nextNoteTime += secondsPer16th * swing;
                this.current16thStep = (this.current16thStep + 1) % 256; // 16 bars * 16 steps
            }
        }, lookaheadMs);
    }

    // 16-Bar Sunny Beach Progression in F Major (Bossa Nova / Cozy Island Pop)
    getBgmScore() {
        if (this._bgmScore) return this._bgmScore;

        // MIDI Note Numbers:
        // F2=41, G2=43, A2=45, Bb2=46, C3=48, D3=50, E3=52, F3=53, G3=55, A3=57
        // C4=60, Db4=61, D4=62, Eb4=63, E4=64, F4=65, G4=67, Ab4=68, A4=69, Bb4=70, B4=71
        // C5=72, Db5=73, D5=74, Eb5=75, E5=76, F5=77, G5=79, Ab5=80, A5=81, Bb5=82, C6=84, D6=86, E6=88, F6=89
        const bars = [
            // --- SECTION A: Sunny Beach Stroll ---
            { // Bar 0: Fmaj9
                bass: [41, 48],
                chord: [65, 69, 72, 76],
                melody: { 0: [81, 2], 2: [84, 2], 4: [81, 2], 6: [79, 3], 10: [77, 2], 12: [74, 2], 14: [72, 2] }
            },
            { // Bar 1: Gm7 -> C9
                bass: [43, 48],
                chord: [62, 65, 70, 74],
                melody: { 0: [74, 3], 3: [77, 2], 6: [79, 3], 10: [81, 2], 12: [79, 4] },
                bell: { 12: 91 }
            },
            { // Bar 2: Am7
                bass: [45, 52],
                chord: [64, 67, 72, 76],
                melody: { 0: [84, 2], 2: [81, 2], 4: [79, 3], 8: [76, 2], 10: [72, 2], 12: [74, 2], 14: [76, 2] }
            },
            { // Bar 3: Dm7 -> G13
                bass: [50, 43],
                chord: [65, 69, 72, 76],
                melody: { 0: [77, 3], 3: [79, 3], 6: [81, 2], 8: [84, 3], 12: [86, 4] },
                bell: { 8: 88, 12: 93 }
            },
            { // Bar 4: Bbmaj7
                bass: [46, 53],
                chord: [62, 65, 69, 74],
                melody: { 0: [86, 2], 2: [84, 2], 4: [81, 3], 8: [77, 2], 10: [74, 2], 12: [77, 2], 14: [79, 2] }
            },
            { // Bar 5: Bbm6 (Warm nostalgic island harmony)
                bass: [46, 53],
                chord: [61, 65, 67, 74],
                melody: { 0: [80, 3], 3: [79, 3], 6: [77, 2], 8: [74, 3], 12: [77, 4] },
                bell: { 12: 89 }
            },
            { // Bar 6: Am7 -> Dm7
                bass: [45, 50],
                chord: [64, 69, 72, 76],
                melody: { 0: [84, 2], 2: [81, 2], 4: [77, 3], 8: [79, 2], 10: [81, 2], 12: [77, 2], 14: [74, 2] }
            },
            { // Bar 7: Gm7 -> C7sus4 -> C7
                bass: [43, 48],
                chord: [64, 67, 70, 74],
                melody: { 0: [79, 2], 2: [81, 2], 4: [82, 2], 6: [79, 3], 10: [76, 2], 12: [77, 4] },
                bell: { 12: 84, 14: 88 }
            },

            // --- SECTION B: Breezy Horizon & Kalimba Sparkle ---
            { // Bar 8: Fmaj7
                bass: [41, 48],
                chord: [65, 69, 72, 76],
                melody: { 0: [84, 3], 3: [86, 2], 6: [84, 3], 10: [81, 2], 12: [77, 4] },
                bell: { 0: 96 }
            },
            { // Bar 9: Em7b5 -> A7
                bass: [52, 45],
                chord: [64, 67, 70, 73],
                melody: { 0: [79, 2], 2: [81, 2], 4: [82, 3], 8: [81, 2], 10: [79, 2], 12: [76, 4] }
            },
            { // Bar 10: Dm7
                bass: [50, 45],
                chord: [65, 69, 72, 76],
                melody: { 0: [77, 2], 2: [81, 2], 4: [84, 3], 8: [86, 2], 10: [84, 2], 12: [81, 4] },
                bell: { 4: 93 }
            },
            { // Bar 11: Cm7 -> F7
                bass: [48, 41],
                chord: [63, 67, 69, 74],
                melody: { 0: [87, 3], 3: [86, 3], 6: [84, 2], 8: [81, 3], 12: [84, 4] },
                bell: { 12: 96 }
            },
            { // Bar 12: Bbmaj7
                bass: [46, 53],
                chord: [62, 65, 69, 74],
                melody: { 0: [86, 2], 2: [89, 2], 4: [86, 2], 6: [84, 3], 10: [82, 2], 12: [81, 2], 14: [79, 2] }
            },
            { // Bar 13: Am7 -> Dm7
                bass: [45, 50],
                chord: [64, 69, 72, 76],
                melody: { 0: [84, 2], 2: [88, 2], 4: [84, 2], 6: [81, 3], 10: [77, 2], 12: [74, 4] },
                bell: { 2: 96 }
            },
            { // Bar 14: Gm7
                bass: [43, 50],
                chord: [62, 65, 70, 74],
                melody: { 0: [82, 2], 2: [81, 2], 4: [79, 2], 6: [77, 3], 10: [74, 2], 12: [77, 2], 14: [79, 2] }
            },
            { // Bar 15: C9sus4 -> C7 (Turnaround)
                bass: [48, 43],
                chord: [64, 67, 70, 74],
                melody: { 0: [81, 3], 3: [79, 3], 6: [77, 2], 8: [76, 3], 12: [77, 4] },
                bell: { 8: 88, 12: 89, 14: 93 }
            }
        ];

        this._bgmScore = bars;
        return bars;
    }

    scheduleBgmStep(stepIndex, time) {
        if (this.bgmMuted || this.bgmVolume <= 0.005) return;

        const bars = this.getBgmScore();
        const barIdx = Math.floor(stepIndex / 16) % bars.length;
        const stepInBar = stepIndex % 16;
        const bar = bars[barIdx];
        const stepDur = 60.0 / this.tempo / 4.0;

        // 1. Acoustic Upright Bass (Bossa pattern: 0, 6, 8, 14)
        if (stepInBar === 0) {
            this.playBgmBass(this.midiToFreq(bar.bass[0]), time, stepDur * 5.2, 0.26);
        } else if (stepInBar === 6) {
            this.playBgmBass(this.midiToFreq(bar.bass[1]), time, stepDur * 1.8, 0.15);
        } else if (stepInBar === 8) {
            this.playBgmBass(this.midiToFreq(bar.bass[1]), time, stepDur * 5.0, 0.23);
        } else if (stepInBar === 14) {
            this.playBgmBass(this.midiToFreq(bar.bass[0] + 7), time, stepDur * 1.8, 0.14);
        }

        // 2. Ukulele / Rhodes Syncopated Bossa Comping (steps 0, 3, 6, 10, 12)
        if (stepInBar === 0 || stepInBar === 3 || stepInBar === 6 || stepInBar === 10 || stepInBar === 12) {
            const isShort = (stepInBar === 3 || stepInBar === 10);
            this.playBgmUkuleleChord(bar.chord, time, stepDur * (isShort ? 2.2 : 3.4), isShort ? 0.065 : 0.085);
        }

        // 3. Lead Marimba / Kalimba Melody
        if (bar.melody && bar.melody[stepInBar]) {
            const [midiNote, lenSteps] = bar.melody[stepInBar];
            this.playBgmMarimba(this.midiToFreq(midiNote), time, stepDur * lenSteps);
        }

        // 4. Sparkling Seashell / Celesta Bell Ornaments
        if (bar.bell && bar.bell[stepInBar]) {
            this.playBgmBell(this.midiToFreq(bar.bell[stepInBar]), time);
        }

        // 5. Delicate Brushed Shaker & Wood Clave Groove
        if (stepInBar % 2 === 0) {
            const accent = (stepInBar % 4 === 2) ? 0.024 : 0.014;
            this.playBgmShaker(time, accent);
        }
        // Soft Bossa rim click on steps 2, 5, 10, 13
        if (stepInBar === 2 || stepInBar === 5 || stepInBar === 10 || stepInBar === 13) {
            this.playBgmWoodClick(time);
        }
    }

    playBgmMarimba(freq, time, duration) {
        const ctx = this.ctx;
        if (!ctx) return;

        // Warm wooden bar fundamental + 4th harmonic overtone (classic marimba/kalimba tuning)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        const gain2 = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, time);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, time);

        const noteDur = Math.max(0.24, Math.min(0.85, duration * 1.1));

        gain1.gain.setValueAtTime(0.0001, time);
        gain1.gain.linearRampToValueAtTime(0.18, time + 0.012);
        gain1.gain.exponentialRampToValueAtTime(0.0008, time + noteDur);

        // Harmonic pluck decays quickly for warm wooden attack
        gain2.gain.setValueAtTime(0.0001, time);
        gain2.gain.linearRampToValueAtTime(0.055, time + 0.006);
        gain2.gain.exponentialRampToValueAtTime(0.0005, time + 0.09);

        osc1.connect(gain1);
        osc2.connect(gain2);

        gain1.connect(this.bgmGain);
        gain2.connect(this.bgmGain);
        if (this.bgmDelay) {
            gain1.connect(this.bgmDelay);
        }

        osc1.start(time);
        osc2.start(time);
        osc1.stop(time + noteDur + 0.02);
        osc2.stop(time + 0.11);
    }

    playBgmUkuleleChord(midiNotes, time, duration, peakGain) {
        const ctx = this.ctx;
        if (!ctx) return;

        midiNotes.forEach((midi, idx) => {
            // Strummed arpeggio offset (14ms per string)
            const t = time + idx * 0.014;
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            osc.type = 'triangle';
            osc.frequency.setValueAtTime(this.midiToFreq(midi), t);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(1750, t);
            filter.frequency.exponentialRampToValueAtTime(750, t + duration);

            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.linearRampToValueAtTime(peakGain, t + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0006, t + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.bgmGain);
            if (this.bgmDelay && idx === midiNotes.length - 1) {
                gain.connect(this.bgmDelay);
            }

            osc.start(t);
            osc.stop(t + duration + 0.02);
        });
    }

    playBgmBass(freq, time, duration, peakGain) {
        const ctx = this.ctx;
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const sub = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, time);
        sub.type = 'sine';
        sub.frequency.setValueAtTime(freq, time);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(360, time);
        filter.frequency.exponentialRampToValueAtTime(160, time + duration);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(peakGain, time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, time + duration);

        osc.connect(filter);
        sub.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(time);
        sub.start(time);
        osc.stop(time + duration + 0.03);
        sub.stop(time + duration + 0.03);
    }

    playBgmBell(freq, time) {
        const ctx = this.ctx;
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, time);

        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(0.075, time + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0004, time + 0.65);

        osc.connect(gain);
        gain.connect(this.bgmGain);
        if (this.bgmDelay) gain.connect(this.bgmDelay);

        osc.start(time);
        osc.stop(time + 0.68);
    }

    playBgmShaker(time, peakGain) {
        const ctx = this.ctx;
        if (!ctx) return;

        if (!this._shakerBuffer) {
            const len = Math.floor(ctx.sampleRate * 0.06);
            this._shakerBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
            const data = this._shakerBuffer.getChannelData(0);
            for (let i = 0; i < len; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.45));
            }
        }

        const src = ctx.createBufferSource();
        src.buffer = this._shakerBuffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(6200, time);
        filter.Q.setValueAtTime(1.8, time);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(peakGain, time);
        gain.gain.exponentialRampToValueAtTime(0.0005, time + 0.055);

        src.connect(filter);
        filter.connect(gain);
        gain.connect(this.bgmGain);

        src.start(time);
    }

    playBgmWoodClick(time) {
        const ctx = this.ctx;
        if (!ctx) return;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1180, time);
        osc.frequency.exponentialRampToValueAtTime(640, time + 0.022);

        gain.gain.setValueAtTime(0.032, time);
        gain.gain.exponentialRampToValueAtTime(0.0005, time + 0.025);

        osc.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(time);
        osc.stop(time + 0.028);
    }

    // =========================================================================
    // 2. SOUND EFFECTS (SFX)
    // =========================================================================

    // UI Button Click / Preview Tick
    playUiClick() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(640, now);
        osc.frequency.exponentialRampToValueAtTime(980, now + 0.045);

        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.055);
    }

    // Cat Tap / Selection Preview Chirp ("mrrp?")
    playSelectChirp() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 3.2;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.10);

        filter.frequency.setValueAtTime(920, now);
        filter.frequency.exponentialRampToValueAtTime(1500, now + 0.10);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.24, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.13);
    }

    // Juicy Multi-Bubble Elimination Cascade + Sparkle Chime
    playEliminate(count = 2) {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        // Pentatonic scale frequencies for rising bubble pops
        const scale = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98];
        const popCount = Math.min(Math.max(2, count), 8);

        for (let i = 0; i < popCount; i++) {
            const t = ctx.currentTime + i * 0.036;
            const targetFreq = scale[i % scale.length];

            // 1. Classic Soap-Bubble Pop (rapid upward pitch sweep)
            const oscPop = ctx.createOscillator();
            const gainPop = ctx.createGain();
            oscPop.type = 'sine';
            oscPop.frequency.setValueAtTime(targetFreq * 0.48, t);
            oscPop.frequency.exponentialRampToValueAtTime(targetFreq * 1.38, t + 0.058);

            gainPop.gain.setValueAtTime(0.001, t);
            gainPop.gain.linearRampToValueAtTime(0.28, t + 0.01);
            gainPop.gain.exponentialRampToValueAtTime(0.001, t + 0.068);

            oscPop.connect(gainPop);
            gainPop.connect(this.sfxGain);
            oscPop.start(t);
            oscPop.stop(t + 0.072);

            // 2. Crisp Wooden/Drop Pluck Body
            const oscBody = ctx.createOscillator();
            const gainBody = ctx.createGain();
            oscBody.type = 'triangle';
            oscBody.frequency.setValueAtTime(targetFreq, t);
            oscBody.frequency.exponentialRampToValueAtTime(targetFreq * 0.72, t + 0.085);

            gainBody.gain.setValueAtTime(0.16, t);
            gainBody.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

            oscBody.connect(gainBody);
            gainBody.connect(this.sfxGain);
            oscBody.start(t);
            oscBody.stop(t + 0.095);
        }

        // Big combo extra star-sparkle chime
        if (count >= 5) {
            const chord = count >= 8 ? [1046.50, 1318.51, 1567.98, 2093.00] : [783.99, 987.77, 1174.66, 1567.98];
            const baseTime = ctx.currentTime + popCount * 0.028;
            chord.forEach((f, idx) => {
                const t = baseTime + idx * 0.04;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, t);

                gain.gain.setValueAtTime(0.001, t);
                gain.gain.linearRampToValueAtTime(0.15, t + 0.012);
                gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.36);

                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t);
                osc.stop(t + 0.38);
            });
        }
    }

    // Backwards-compatible alias for playPop
    playPop(pitchModifier = 1.0, count = 3) {
        this.playEliminate(count);
    }

    // Authentic Dual-Formant Cat Meow (Kitten, Normal, Curious, Big)
    playCatMeow(variant = 'normal') {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const oscMain = ctx.createOscillator();
        const oscSub = ctx.createOscillator();
        const vibrato = ctx.createOscillator();
        const vibratoGain = ctx.createGain();

        // Two vocal tract formants (F1 & F2) in parallel for realistic feline "M-e-o-w"
        const filterF1 = ctx.createBiquadFilter();
        const filterF2 = ctx.createBiquadFilter();
        filterF1.type = 'bandpass';
        filterF1.Q.value = 4.5;
        filterF2.type = 'bandpass';
        filterF2.Q.value = 5.5;

        const f2Gain = ctx.createGain();
        f2Gain.gain.setValueAtTime(0.42, now);

        const masterGain = ctx.createGain();

        // Subtle natural feline vibrato
        vibrato.type = 'sine';
        vibrato.frequency.setValueAtTime(6.2, now);
        vibratoGain.gain.setValueAtTime(11, now);
        vibrato.connect(vibratoGain);
        vibratoGain.connect(oscMain.frequency);

        let dur = 0.45;

        if (variant === 'kitten') {
            // Sweet high baby kitten "Mew~!"
            dur = 0.34;
            oscMain.type = 'sawtooth';
            oscSub.type = 'triangle';

            oscMain.frequency.setValueAtTime(660, now);
            oscMain.frequency.linearRampToValueAtTime(1060, now + 0.11);
            oscMain.frequency.exponentialRampToValueAtTime(720, now + dur);

            oscSub.frequency.setValueAtTime(660, now);
            oscSub.frequency.linearRampToValueAtTime(1060, now + 0.11);
            oscSub.frequency.exponentialRampToValueAtTime(720, now + dur);

            filterF1.frequency.setValueAtTime(950, now);
            filterF1.frequency.linearRampToValueAtTime(1750, now + 0.12);
            filterF1.frequency.exponentialRampToValueAtTime(1050, now + dur);

            filterF2.frequency.setValueAtTime(2100, now);
            filterF2.frequency.linearRampToValueAtTime(2900, now + 0.12);
            filterF2.frequency.exponentialRampToValueAtTime(2000, now + dur);

            masterGain.gain.setValueAtTime(0.001, now);
            masterGain.gain.linearRampToValueAtTime(0.28, now + 0.04);
            masterGain.gain.setValueAtTime(0.25, now + 0.14);
            masterGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        } else if (variant === 'curious') {
            // Cute questioning "Mrr-ow?"
            dur = 0.38;
            oscMain.type = 'sawtooth';
            oscSub.type = 'triangle';

            oscMain.frequency.setValueAtTime(480, now);
            oscMain.frequency.linearRampToValueAtTime(620, now + 0.12);
            oscMain.frequency.exponentialRampToValueAtTime(920, now + 0.30);
            oscMain.frequency.exponentialRampToValueAtTime(780, now + dur);

            oscSub.frequency.setValueAtTime(480, now);
            oscSub.frequency.linearRampToValueAtTime(620, now + 0.12);
            oscSub.frequency.exponentialRampToValueAtTime(920, now + 0.30);
            oscSub.frequency.exponentialRampToValueAtTime(780, now + dur);

            filterF1.frequency.setValueAtTime(800, now);
            filterF1.frequency.linearRampToValueAtTime(1600, now + 0.26);
            filterF1.frequency.exponentialRampToValueAtTime(1150, now + dur);

            filterF2.frequency.setValueAtTime(1700, now);
            filterF2.frequency.linearRampToValueAtTime(2600, now + 0.26);
            filterF2.frequency.exponentialRampToValueAtTime(1950, now + dur);

            masterGain.gain.setValueAtTime(0.001, now);
            masterGain.gain.linearRampToValueAtTime(0.26, now + 0.045);
            masterGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        } else if (variant === 'big') {
            // Enthusiastic happy "Nyaaa~!"
            dur = 0.56;
            oscMain.type = 'sawtooth';
            oscSub.type = 'triangle';

            oscMain.frequency.setValueAtTime(540, now);
            oscMain.frequency.linearRampToValueAtTime(1040, now + 0.16);
            oscMain.frequency.setValueAtTime(1010, now + 0.26);
            oscMain.frequency.exponentialRampToValueAtTime(620, now + dur);

            oscSub.frequency.setValueAtTime(540, now);
            oscSub.frequency.linearRampToValueAtTime(1040, now + 0.16);
            oscSub.frequency.setValueAtTime(1010, now + 0.26);
            oscSub.frequency.exponentialRampToValueAtTime(620, now + dur);

            filterF1.frequency.setValueAtTime(900, now);
            filterF1.frequency.linearRampToValueAtTime(1850, now + 0.18);
            filterF1.frequency.exponentialRampToValueAtTime(920, now + dur);

            filterF2.frequency.setValueAtTime(1850, now);
            filterF2.frequency.linearRampToValueAtTime(2800, now + 0.18);
            filterF2.frequency.exponentialRampToValueAtTime(1750, now + dur);

            masterGain.gain.setValueAtTime(0.001, now);
            masterGain.gain.linearRampToValueAtTime(0.32, now + 0.05);
            masterGain.gain.setValueAtTime(0.28, now + 0.24);
            masterGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        } else {
            // Classic warm "Meoow~"
            dur = 0.46;
            oscMain.type = 'sawtooth';
            oscSub.type = 'triangle';

            oscMain.frequency.setValueAtTime(490, now);
            oscMain.frequency.linearRampToValueAtTime(850, now + 0.14);
            oscMain.frequency.exponentialRampToValueAtTime(510, now + dur);

            oscSub.frequency.setValueAtTime(490, now);
            oscSub.frequency.linearRampToValueAtTime(850, now + 0.14);
            oscSub.frequency.exponentialRampToValueAtTime(510, now + dur);

            filterF1.frequency.setValueAtTime(820, now);
            filterF1.frequency.linearRampToValueAtTime(1550, now + 0.15);
            filterF1.frequency.exponentialRampToValueAtTime(840, now + dur);

            filterF2.frequency.setValueAtTime(1750, now);
            filterF2.frequency.linearRampToValueAtTime(2500, now + 0.15);
            filterF2.frequency.exponentialRampToValueAtTime(1650, now + dur);

            masterGain.gain.setValueAtTime(0.001, now);
            masterGain.gain.linearRampToValueAtTime(0.28, now + 0.045);
            masterGain.gain.setValueAtTime(0.24, now + 0.18);
            masterGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
        }

        oscMain.connect(filterF1);
        oscMain.connect(filterF2);
        oscSub.connect(filterF1);

        filterF1.connect(masterGain);
        filterF2.connect(f2Gain);
        f2Gain.connect(masterGain);
        masterGain.connect(this.sfxGain);

        oscMain.start(now);
        oscSub.start(now);
        vibrato.start(now);

        oscMain.stop(now + dur + 0.03);
        oscSub.stop(now + dur + 0.03);
        vibrato.stop(now + dur + 0.03);
    }

    // Stage Cleared Celebration Fanfare + Party Popper + Happy Cat Cheer!
    playLevelClear() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;

        // 1. Crisp Confetti Party Popper Burst
        const playPopper = (t) => {
            const popOsc = ctx.createOscillator();
            const popGain = ctx.createGain();
            popOsc.type = 'sine';
            popOsc.frequency.setValueAtTime(260, t);
            popOsc.frequency.exponentialRampToValueAtTime(920, t + 0.045);
            popGain.gain.setValueAtTime(0.32, t);
            popGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
            popOsc.connect(popGain);
            popGain.connect(this.sfxGain);
            popOsc.start(t);
            popOsc.stop(t + 0.065);
        };
        playPopper(now);
        playPopper(now + 0.42);

        // 2. Triumphant Fanfare Melody (C5 - E5 - G5 - C6 - G5 - C6!)
        const fanfare = [
            { f: 523.25, t: 0.02, d: 0.13 }, // C5
            { f: 659.25, t: 0.14, d: 0.13 }, // E5
            { f: 783.99, t: 0.26, d: 0.13 }, // G5
            { f: 1046.50, t: 0.38, d: 0.24 }, // C6
            { f: 783.99, t: 0.64, d: 0.14 }, // G5
            { f: 1046.50, t: 0.78, d: 0.65 }  // C6!
        ];

        fanfare.forEach(note => {
            const t = now + note.t;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'triangle';
            osc1.frequency.setValueAtTime(note.f, t);
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(note.f * 2, t);

            gain.gain.setValueAtTime(0.001, t);
            gain.gain.linearRampToValueAtTime(0.28, t + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.001, t + note.d);

            const g2 = ctx.createGain();
            g2.gain.setValueAtTime(0.08, t);
            g2.gain.exponentialRampToValueAtTime(0.001, t + note.d * 0.6);

            osc1.connect(gain);
            osc2.connect(g2);
            g2.connect(gain);
            gain.connect(this.sfxGain);

            osc1.start(t);
            osc2.start(t);
            osc1.stop(t + note.d + 0.02);
            osc2.stop(t + note.d + 0.02);
        });

        // 3. Rich Warm Harmony Chords Underneath
        const chords = [
            { notes: [349.23, 440.00, 523.25], t: 0.38, d: 0.24 }, // F major
            { notes: [392.00, 493.88, 587.33], t: 0.64, d: 0.14 }, // G major
            { notes: [523.25, 659.25, 783.99], t: 0.78, d: 0.75 }  // C major
        ];
        chords.forEach(ch => {
            const t = now + ch.t;
            ch.notes.forEach(f => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(f, t);
                gain.gain.setValueAtTime(0.001, t);
                gain.gain.linearRampToValueAtTime(0.11, t + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, t + ch.d);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t);
                osc.stop(t + ch.d + 0.03);
            });
        });

        // 4. Sparkling Star-Shower Glockenspiel Arpeggio
        const sparkles = [1046.50, 1174.66, 1318.51, 1567.98, 1760.00, 2093.00, 2637.02];
        sparkles.forEach((f, i) => {
            const t = now + 0.80 + i * 0.045;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(0.001, t);
            gain.gain.linearRampToValueAtTime(0.14, t + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0008, t + 0.38);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(t);
            osc.stop(t + 0.4);
        });

        // 5. Celebratory Happy Kitten Cheer!
        setTimeout(() => {
            if (this.canPlaySfx()) this.playCatMeow('big');
        }, 520);
    }

    // Failure / Disappointed Sound ("Wah-wah-wah-waaah~" + Dejected Kitten Whimper)
    playLose() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;

        // 1. Classic Sad Descending "Wah-Wah-Wah-Waaah..."
        const sadNotes = [
            { fStart: 392.00, fEnd: 375.00, t: 0.00, d: 0.28 }, // G4
            { fStart: 369.99, fEnd: 352.00, t: 0.30, d: 0.28 }, // F#4
            { fStart: 349.23, fEnd: 332.00, t: 0.60, d: 0.28 }, // F4
            { fStart: 329.63, fEnd: 246.94, t: 0.90, d: 0.82 }  // E4 drooping down to B3
        ];

        sadNotes.forEach((note, idx) => {
            const t = now + note.t;
            const osc = ctx.createOscillator();
            const sub = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(note.fStart, t);
            osc.frequency.exponentialRampToValueAtTime(note.fEnd, t + note.d);

            sub.type = 'triangle';
            sub.frequency.setValueAtTime(note.fStart * 0.5, t);
            sub.frequency.exponentialRampToValueAtTime(note.fEnd * 0.5, t + note.d);

            // "Wah" vocal filter sweep
            filter.type = 'bandpass';
            filter.Q.value = 3.2;
            filter.frequency.setValueAtTime(480, t);
            filter.frequency.linearRampToValueAtTime(1150, t + 0.08);
            filter.frequency.exponentialRampToValueAtTime(380, t + note.d);

            // Wobble on the final long droopy note
            if (idx === 3) {
                const lfo = ctx.createOscillator();
                const lfoG = ctx.createGain();
                lfo.frequency.setValueAtTime(5.2, t);
                lfoG.gain.setValueAtTime(9, t);
                lfo.connect(lfoG);
                lfoG.connect(osc.frequency);
                lfo.start(t);
                lfo.stop(t + note.d + 0.04);
            }

            gain.gain.setValueAtTime(0.001, t);
            gain.gain.linearRampToValueAtTime(0.28, t + 0.035);
            gain.gain.exponentialRampToValueAtTime(0.001, t + note.d);

            osc.connect(filter);
            sub.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(t);
            sub.start(t);
            osc.stop(t + note.d + 0.04);
            sub.stop(t + note.d + 0.04);
        });

        // 2. Sad Droopy Kitten Whimper ("mew...")
        const meowTime = now + 0.95;
        const mOsc = ctx.createOscillator();
        const mFilter = ctx.createBiquadFilter();
        const mGain = ctx.createGain();

        mOsc.type = 'sawtooth';
        mOsc.frequency.setValueAtTime(680, meowTime);
        mOsc.frequency.linearRampToValueAtTime(740, meowTime + 0.07);
        mOsc.frequency.exponentialRampToValueAtTime(340, meowTime + 0.62);

        mFilter.type = 'bandpass';
        mFilter.Q.value = 4.2;
        mFilter.frequency.setValueAtTime(1350, meowTime);
        mFilter.frequency.exponentialRampToValueAtTime(620, meowTime + 0.62);

        mGain.gain.setValueAtTime(0.001, meowTime);
        mGain.gain.linearRampToValueAtTime(0.24, meowTime + 0.05);
        mGain.gain.exponentialRampToValueAtTime(0.001, meowTime + 0.64);

        mOsc.connect(mFilter);
        mFilter.connect(mGain);
        mGain.connect(this.sfxGain);

        mOsc.start(meowTime);
        mOsc.stop(meowTime + 0.66);
    }

    // Ocean Seagull call
    playSeagull() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(1500, now);
        osc.frequency.linearRampToValueAtTime(2300, now + 0.12);
        osc.frequency.exponentialRampToValueAtTime(1600, now + 0.38);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.14, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.42);

        setTimeout(() => {
            if (!this.canPlaySfx() || !this.ctx) return;
            const t2 = this.ctx.currentTime;
            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1800, t2);
            osc2.frequency.linearRampToValueAtTime(2500, t2 + 0.1);
            osc2.frequency.exponentialRampToValueAtTime(1900, t2 + 0.32);

            gain2.gain.setValueAtTime(0.001, t2);
            gain2.gain.linearRampToValueAtTime(0.10, t2 + 0.06);
            gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.35);

            osc2.connect(gain2);
            gain2.connect(this.sfxGain);
            osc2.start(t2);
            osc2.stop(t2 + 0.36);
        }, 320);
    }

    // Wand Prop Activation / Coloring Magic Chime
    playWandMagic() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51];
        notes.forEach((freq, idx) => {
            const now = ctx.currentTime + idx * 0.06;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);

            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.24, now + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

            osc.connect(gain);
            gain.connect(this.sfxGain);

            osc.start(now);
            osc.stop(now + 0.34);
        });
    }

    // Droplet water splash when dyeing
    playDropSplash() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        osc.frequency.exponentialRampToValueAtTime(1120, now + 0.12);

        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.15);
    }

    // Wheel Spin Tick Sound
    playWheelTick() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(840, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.028);

        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

        osc.connect(gain);
        gain.connect(this.sfxGain);

        osc.start(now);
        osc.stop(now + 0.035);
    }

    // Ocean ambience is a game sound and follows the effects slider.
    playWaveSwoosh() {
        if (!this.canPlaySfx()) return;
        const ctx = this.ensureCtx();
        if (!ctx) return;

        try {
            const bufferSize = Math.floor(ctx.sampleRate * 2.2);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            const now = ctx.currentTime;
            filter.frequency.setValueAtTime(160, now);
            filter.frequency.linearRampToValueAtTime(420, now + 0.9);
            filter.frequency.exponentialRampToValueAtTime(140, now + 2.2);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.0005, now);
            gain.gain.linearRampToValueAtTime(0.038, now + 0.9);
            gain.gain.exponentialRampToValueAtTime(0.0005, now + 2.2);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            noise.start(now);
            noise.stop(now + 2.25);
        } catch (e) {}
    }

    // Background scheduler: gentle ocean waves + occasional cat meow during gameplay
    startAmbientLoop() {
        if (this.ambientActive) return;
        this.ambientActive = true;

        const scheduleNextWave = () => {
            const delay = 11000 + Math.random() * 9000;
            setTimeout(() => {
                if (!document.hidden) this.playWaveSwoosh();
                scheduleNextWave();
            }, delay);
        };

        const scheduleNextRandomMeow = () => {
            // Cats occasionally meow every 12~22 seconds while playing
            const delay = 12000 + Math.random() * 10000;
            setTimeout(() => {
                if (!document.hidden && window.game?.playing && !window.game.state.settled && this.ctx?.state === 'running' && this.ctx.currentTime >= (this.nextMeow || 0)) {
                    this.nextMeow = this.ctx.currentTime + 12;
                    const variants = ['kitten', 'normal', 'curious'];
                    const pick = variants[Math.floor(Math.random() * variants.length)];
                    this.playCatMeow(pick);
                }
                scheduleNextRandomMeow();
            }, delay);
        };

        scheduleNextWave();
        scheduleNextRandomMeow();
    }
}

window.sounds = new SoundManager();

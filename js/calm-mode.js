// ============================================================
// Voxora Calm Mode — Breathing Exercise Controller
// Self-contained: opens overlay, runs a 60-second guided
// breathing cycle (4s inhale / 6s exhale), then shows a
// completion screen with a "Start Interview" button.
// All timers are cleared on close. Does not touch mic,
// STT, interview timers, AI evaluation, or history.
// ============================================================

const CalmMode = {
  state: {
    active: false,
    running: false,
    paused: false,
    phase: 'idle',         // 'idle' | 'inhale' | 'exhale'
    totalMs: 60000,
    elapsedMs: 0,
    phaseElapsedMs: 0,
    intervalId: null
  },

  // Breathing phase definitions
  PHASES: {
    inhale: { duration: 4000, next: 'exhale', label: 'Breathe in' },
    exhale: { duration: 6000, next: 'inhale',  label: 'Breathe out' }
  },

  init() {
    this._bindEvents();
  },

  // ===== EVENT BINDING =====
  _bindEvents() {
    const openBtn = document.getElementById('calm-mode-btn');
    if (openBtn) openBtn.addEventListener('click', () => this.open());

    const closeBtn = document.getElementById('calm-close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    const startBtn = document.getElementById('calm-start-btn');
    if (startBtn) startBtn.addEventListener('click', () => this.start());

    const pauseBtn = document.getElementById('calm-pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', () => this.togglePause());

    const skipBtn = document.getElementById('calm-skip-btn');
    if (skipBtn) skipBtn.addEventListener('click', () => this.skip());

    const finishBtn = document.getElementById('calm-finish-btn');
    if (finishBtn) finishBtn.addEventListener('click', () => this.proceedToInterview());

    // Click outside modal to close
    const overlay = document.getElementById('calm-overlay');
    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state.active) this.close();
    });
  },

  // ===== OPEN / CLOSE =====
  open() {
    const overlay = document.getElementById('calm-overlay');
    if (!overlay) return;

    this.state.active = true;
    this.state.running = false;
    this.state.paused = false;
    this.state.phase = 'idle';
    this.state.elapsedMs = 0;
    this.state.phaseElapsedMs = 0;

    // Show breathing view, hide completion view
    document.getElementById('calm-breathing-view').style.display = '';
    document.getElementById('calm-complete-view').style.display = 'none';

    // Reset circle and UI
    this._setCircleClass('idle');
    this._setInstruction('Ready to begin');
    this._updateTimer(this.state.totalMs);
    this._updateProgress(0);

    // Show Start button, hide Pause and Skip
    document.getElementById('calm-start-btn').style.display = '';
    document.getElementById('calm-pause-btn').style.display = 'none';
    document.getElementById('calm-skip-btn').style.display = 'none';

    overlay.style.display = 'flex';
  },

  close() {
    this._cleanupTimers();
    this._setCircleClass('idle');
    this.state.active = false;
    this.state.running = false;
    this.state.paused = false;
    const overlay = document.getElementById('calm-overlay');
    if (overlay) overlay.style.display = 'none';
  },

  // ===== EXERCISE CONTROLS =====
  start() {
    if (this.state.running) return;
    this.state.running = true;
    this.state.paused = false;
    this.state.elapsedMs = 0;
    this.state.phaseElapsedMs = 0;

    // Hide Start, show Pause + Skip
    document.getElementById('calm-start-btn').style.display = 'none';
    const pauseBtn = document.getElementById('calm-pause-btn');
    pauseBtn.style.display = '';
    pauseBtn.textContent = 'Pause';
    document.getElementById('calm-skip-btn').style.display = '';

    this._startPhase('inhale');

    this.state.intervalId = setInterval(() => this._tick(), 100);
  },

  togglePause() {
    if (!this.state.running) return;
    this.state.paused = !this.state.paused;

    const circle = document.getElementById('calm-circle');
    const pauseBtn = document.getElementById('calm-pause-btn');

    if (this.state.paused) {
      if (circle) circle.classList.add('calm-paused');
      if (pauseBtn) pauseBtn.textContent = 'Resume';
      this._setInstruction('Paused');
    } else {
      if (circle) circle.classList.remove('calm-paused');
      if (pauseBtn) pauseBtn.textContent = 'Pause';
      const phaseInfo = this.PHASES[this.state.phase];
      if (phaseInfo) this._setInstruction(phaseInfo.label);
    }
  },

  skip() {
    this._finish();
  },

  // ===== INTERNAL LOOP =====
  _tick() {
    if (this.state.paused) return;

    const tickMs = 100;
    this.state.elapsedMs += tickMs;
    this.state.phaseElapsedMs += tickMs;

    // Phase transition
    const currentPhase = this.PHASES[this.state.phase];
    if (currentPhase && this.state.phaseElapsedMs >= currentPhase.duration) {
      this.state.phaseElapsedMs = 0;
      this._startPhase(currentPhase.next);
    }

    // Update UI
    this._updateTimer(this.state.totalMs - this.state.elapsedMs);
    this._updateProgress((this.state.elapsedMs / this.state.totalMs) * 100);

    // Completion check
    if (this.state.elapsedMs >= this.state.totalMs) {
      this._finish();
    }
  },

  _startPhase(phase) {
    this.state.phase = phase;
    this.state.phaseElapsedMs = 0;
    this._setCircleClass(phase);

    const phaseInfo = this.PHASES[phase];
    if (phaseInfo) this._setInstruction(phaseInfo.label);
  },

  _finish() {
    this._cleanupTimers();
    this._setCircleClass('idle');
    this.state.running = false;
    this.state.phase = 'idle';

    // Show completion view
    document.getElementById('calm-breathing-view').style.display = 'none';
    document.getElementById('calm-complete-view').style.display = '';
  },

  proceedToInterview() {
    this.close();
    if (typeof App !== 'undefined' && App.validateSetup()) {
      App.navigate('interview');
    }
  },

  // ===== UI HELPERS =====
  _setCircleClass(state) {
    const circle = document.getElementById('calm-circle');
    if (!circle) return;

    circle.classList.remove(
      'calm-circle-inhale', 'calm-circle-exhale',
      'calm-circle-idle', 'calm-circle-static', 'calm-paused'
    );

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      circle.classList.add('calm-circle-static');
      return;
    }

    if (state === 'inhale') circle.classList.add('calm-circle-inhale');
    else if (state === 'exhale') circle.classList.add('calm-circle-exhale');
    else circle.classList.add('calm-circle-idle');
  },

  _setInstruction(text) {
    const el = document.getElementById('calm-instruction');
    if (el) el.textContent = text;
  },

  _updateTimer(remainingMs) {
    const el = document.getElementById('calm-timer');
    if (!el) return;
    const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    el.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  },

  _updateProgress(pct) {
    const fill = document.getElementById('calm-progress-fill');
    if (fill) fill.style.width = Math.min(100, pct) + '%';
  },

  _cleanupTimers() {
    if (this.state.intervalId) {
      clearInterval(this.state.intervalId);
      this.state.intervalId = null;
    }
  }
};

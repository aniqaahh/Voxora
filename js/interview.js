// ============================================================
// Voxora Interview Controller & Speech Engine
// Handles: Session setup, question shuffling (no repeats),
// random category selection (dice roll), speech recognition (STT),
// text-to-speech (TTS), and answer persistence.
// ============================================================

const Interview = {
  state: {
    active: false,
    selectedCategory: 'general',
    questionCount: 3,
    currentIndex: 0,
    questions: MOCK_QUESTIONS,
    answers: [],
    evaluations: [],
    currentEvaluation: null,
    followUpActive: false,
    followUpQuestion: null,
    isRecording: false,
    recognition: null,
    speechSupported: false,
    ttsSupported: false,
    micStream: null,
    timerInterval: null,
    elapsedTime: 0,
    readyToProceed: false
  },

  // ===== RANDOM CATEGORY SELECTION (DICE ROLL) =====
  rollRandomCategory() {
    const categories = Object.keys(QUESTION_BANKS);
    const randomIndex = Math.floor(Math.random() * categories.length);
    const rolledCategory = categories[randomIndex];
    
    this.state.selectedCategory = rolledCategory;

    // Update Setup UI if present
    const categorySelect = document.getElementById('category-select');
    const categoryDesc = document.getElementById('category-description');
    
    if (categorySelect) categorySelect.value = rolledCategory;
    if (categoryDesc && CATEGORY_DESCRIPTIONS[rolledCategory]) {
      categoryDesc.textContent = CATEGORY_DESCRIPTIONS[rolledCategory];
    }

    return rolledCategory;
  },

  // ===== LIFECYCLE =====
  start(config = {}) {
    this.state.active = true;
    this.state.currentIndex = 0;
    this.state.answers = [];
    this.state.evaluations = [];
    this.state.currentEvaluation = null;
    this.state.followUpActive = false;
    this.state.followUpQuestion = null;
    this.state.elapsedTime = 0;
    
    // Config values passed from App/Setup
    this.state.selectedCategory = config.category || 'general';
    this.state.questionCount = parseInt(config.questionCount, 10) || 3;

    // Load and shuffle questions for selected category (prevents duplication)
    this.loadQuestionsForCategory(this.state.selectedCategory, this.state.questionCount);

    // Check speech recognition support
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.state.speechSupported = !!SR;
    if (SR) {
      this.state.recognition = new SR();
      this.state.recognition.continuous = true;
      this.state.recognition.interimResults = true;
      this.state.recognition.lang = 'en-US';
      this.setupRecognition();
    }

    // Check text-to-speech support
    this.state.ttsSupported = typeof window.speechSynthesis !== 'undefined' &&
      typeof window.speechSynthesis.speak === 'function';

    const readBtn = document.getElementById('read-question-btn');
    if (readBtn) {
      readBtn.style.display = this.state.ttsSupported ? 'inline-flex' : 'none';
    }

    // Update Session Info UI
    const modeLabel = document.getElementById('session-mode');
    if (modeLabel) {
      modeLabel.textContent = 'Voice';
    }

    const catLabel = document.getElementById('session-category');
    if (catLabel) {
      catLabel.textContent = this.state.selectedCategory.toUpperCase();
    }

    document.getElementById('session-questions').textContent = this.state.questions.length;
    document.getElementById('question-total').textContent = this.state.questions.length;

    this.bindControls();
    this.startTimer();
    this.loadQuestion(0);
  },

  loadQuestionsForCategory(categoryKey, count) {
    const bank = QUESTION_BANKS[categoryKey] || QUESTION_BANKS.general;
    // Fisher-Yates unbiased shuffle
    const shuffled = [...bank].sort(() => 0.5 - Math.random());
    this.state.questions = shuffled.slice(0, Math.min(count, shuffled.length));
  },

  cleanup() {
    this.state.active = false;
    this.stopSpeaking();
    this.stopRecording();
    this.stopMicStream();
    this.stopTimer();
  },

  // ===== QUESTION DISPLAY =====
  loadQuestion(index) {
    this.state.currentIndex = index;
    const q = this.state.questions[index];
    if (!q) return;

    this.stopSpeaking();

    document.getElementById('question-current').textContent = index + 1;
    document.getElementById('question-text').textContent = q.text;

    // Restore previously entered answer if navigating back/forth
    const answerText = document.getElementById('answer-text');
    answerText.value = '';
    answerText.readOnly = false;
    this.updateStatus('Ready to answer');

    // Hide STAR feedback panel and follow-up area
    const starPanel = document.getElementById('star-feedback-panel');
    if (starPanel) starPanel.style.display = 'none';
    const followUpArea = document.getElementById('followup-area');
    if (followUpArea) followUpArea.style.display = 'none';
    this.state.followUpActive = false;
    this.state.currentEvaluation = null;

    // Reset mic button
    this.resetMicButton();

    // Switch next button to "submit" mode via flag (no DOM cloning)
    this.state.readyToProceed = false;
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
      nextBtn.disabled = false;
      nextBtn.style.opacity = '';
      nextBtn.classList.remove('btn-ready');
      nextBtn.textContent = (index === this.state.questions.length - 1)
        ? 'Submit & Finish →'
        : 'Submit Answer →';
    }

    // Re-enable skip button for the new question
    const skipBtn = document.getElementById('skip-btn');
    if (skipBtn) {
      skipBtn.style.opacity = '';
      skipBtn.style.pointerEvents = '';
    }
  },

  // ===== SPEECH RECOGNITION (STT) =====
  setupRecognition() {
    const rec = this.state.recognition;
    const answerText = document.getElementById('answer-text');
    let baseText = '';

    rec.onstart = () => {
      baseText = answerText.value;
      this.updateStatus('Listening... Speak now');
      this.setRecordingUI(true);
    };

    rec.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      // Prevents duplicated text by strictly separating locked final speech from active interim prediction
      if (final) {
        baseText += (baseText && !baseText.endsWith(' ') ? ' ' : '') + final;
        answerText.value = baseText;
      } else {
        answerText.value = (baseText ? baseText + ' ' : '') + interim;
      }
    };

    rec.onerror = (event) => {
      const errType = event.error;
      if (errType === 'not-allowed' || errType === 'service-not-allowed') {
        this.updateStatus('Microphone permission denied. Type your answer instead.');
        App.toast('Microphone permission denied. You can type your answer instead.', 'error');
      } else if (errType === 'audio-capture') {
        this.updateStatus('No microphone detected. Type your answer below.');
        App.toast('No microphone found. You can type your answer instead.', 'error');
      } else {
        this.updateStatus('Speech recognition error (' + errType + '). Type your answer.');
      }
      this.setRecordingUI(false);
    };

    rec.onend = () => {
      if (this.state.isRecording) {
        try { rec.start(); } catch(e) {}
      } else {
        this.setRecordingUI(false);
        if (answerText.value.trim()) {
          this.updateStatus('Answer recorded. Review and submit.');
        } else {
          this.updateStatus('Ready to answer');
        }
      }
    };
  },

  toggleRecording() {
    if (this.state.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  },

  startRecording() {
    if (!this.state.speechSupported) {
      App.toast('Speech recognition is not supported in this browser. Please type your answer.', 'error');
      return;
    }

    this.stopSpeaking();

    if (!window.isSecureContext) {
      App.toast('Microphone requires HTTPS or localhost. Type your answer below.', 'error');
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      App.toast('Browser does not support microphone API. Type your answer below.', 'error');
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        this.state.micStream = stream;
        this.state.isRecording = true;
        this.updateStatus('Listening... Speak now');
        try {
          this.state.recognition.start();
        } catch(e) {
          console.warn('Speech recognition already started:', e.message);
        }
      })
      .catch((err) => {
        this.handleMicError(err);
      });
  },

  handleMicError(err) {
    const name = err && err.name ? err.name : 'UnknownError';
    App.toast('Microphone error: ' + name + '. Type your answer below.', 'error');
    this.updateStatus('Mic error (' + name + '). Type your answer below.');
    this.setRecordingUI(false);
  },

  stopMicStream() {
    if (this.state.micStream) {
      this.state.micStream.getTracks().forEach(t => t.stop());
      this.state.micStream = null;
    }
  },

  stopRecording() {
    this.state.isRecording = false;
    if (this.state.recognition) {
      try { this.state.recognition.stop(); } catch(e) {}
    }
    this.stopMicStream();
    this.setRecordingUI(false);
  },

  // ===== TEXT-TO-SPEECH (TTS) =====
  speakQuestion() {
    if (!this.state.ttsSupported) return;
    window.speechSynthesis.cancel();

    const q = this.state.questions[this.state.currentIndex];
    if (!q) return;

    const utterance = new SpeechSynthesisUtterance(q.text);
    utterance.rate = 0.95;
    utterance.lang = 'en-US';

    window.speechSynthesis.speak(utterance);
  },

  stopSpeaking() {
    if (this.state.ttsSupported && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
  },

  toggleSpeak() {
    if (this.state.ttsSupported && window.speechSynthesis.speaking) {
      this.stopSpeaking();
    } else {
      this.speakQuestion();
    }
  },

  setRecordingUI(recording) {
    const micBtn = document.getElementById('mic-btn');
    const label = document.getElementById('mic-btn-label');
    if (!micBtn || !label) return;

    if (recording) {
      micBtn.classList.add('recording');
      label.textContent = 'Stop Recording';
    } else {
      micBtn.classList.remove('recording');
      label.textContent = 'Start Recording';
    }
  },

  resetMicButton() {
    this.stopRecording();
  },

  updateStatus(text) {
    const status = document.getElementById('answer-status');
    if (!status) return;
    status.textContent = text;
    if (text.includes('Listening')) {
      status.classList.add('recording');
    } else {
      status.classList.remove('recording');
    }
  },

  // ===== ANSWER FLOW =====
  async submitAnswer() {
    this.stopRecording();
    const answerText = document.getElementById('answer-text');
    const answer = answerText ? answerText.value.trim() : '';

    if (!answer) {
      App.toast('Please record or type an answer before submitting.', 'error');
      return;
    }

    const q = this.state.questions[this.state.currentIndex];
    const jdText = App.state.jdText || '';

    // Store the answer immediately
    this.state.answers[this.state.currentIndex] = {
      questionId: q.id,
      questionText: q.text,
      questionCategory: q.category,
      answer: answer
    };

    // Make answer text read-only during evaluation
    answerText.readOnly = true;

    // Show loading state
    this.showEvaluationLoading();

    // Try AI evaluation via backend API
    let evaluation = null;
    try {
      evaluation = await this.callEvaluateAPI(answer, q.text, jdText);
    } catch (err) {
      console.warn('[Voxora] AI evaluation failed, falling back to heuristic:', err.message);
    }

    // Fall back to heuristic if AI didn't return
    if (!evaluation) {
      evaluation = StarEvaluator.evaluate(answer, q.text, jdText);
      App.toast('Using heuristic evaluation (AI unavailable).', '');
    } else {
      App.toast('Answer evaluated by Gemini AI — review your STAR feedback below.', 'success');
    }

    // Store the evaluation
    this.state.evaluations[this.state.currentIndex] = evaluation;
    this.state.currentEvaluation = evaluation;

    // Show inline STAR feedback
    this.showStarFeedback(evaluation);

    // Check if a follow-up is needed
    const followUp = StarEvaluator.needsFollowUp(evaluation);
    if (followUp) {
      this.showFollowUp(followUp);
    } else {
      // No follow-up needed — enable "Next Question" button
      this.enableProceed();
    }
  },

  // ===== Call backend /api/evaluate endpoint =====
  async callEvaluateAPI(answer, question, jd) {
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: answer,
        question: question,
        jd: jd || ''
      })
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();

    // If the backend says to fall back, return null
    if (data.fallback) {
      console.info('[Voxora] Backend recommended fallback:', data.reason, data.message);
      return null;
    }

    if (!data.success || !data.evaluation) {
      throw new Error('Unexpected response format from server');
    }

    return data.evaluation;
  },

  // ===== Show loading spinner while evaluating =====
  showEvaluationLoading() {
    const panel = document.getElementById('star-feedback-panel');
    if (!panel) return;

    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="star-loading">
        <div class="star-loading-spinner"></div>
        <p class="star-loading-text">Evaluating your answer with AI...</p>
        <p class="star-loading-sub">This may take a few seconds.</p>
      </div>
    `;

    // Disable the submit button while evaluating
    const nextBtn = document.getElementById('next-btn');
    if (nextBtn) {
      nextBtn.disabled = true;
      nextBtn.style.opacity = '0.5';
      nextBtn.textContent = 'Evaluating...';
    }

    // Disable follow-up submit if active
    const followUpSubmit = document.getElementById('followup-submit-btn');
    if (followUpSubmit) {
      followUpSubmit.disabled = true;
      followUpSubmit.style.opacity = '0.5';
    }
  },

  // ===== STAR FEEDBACK DISPLAY =====
  showStarFeedback(evaluation) {
    const panel = document.getElementById('star-feedback-panel');
    if (!panel) return;

    panel.style.display = 'block';

    // Rebuild the panel structure (in case it was replaced by loading state)
    const isAI = evaluation.evaluatorType === 'gemini';
    const evaluatorBadge = isAI
      ? '<span class="evaluator-badge evaluator-badge-ai">AI (Gemini)</span>'
      : '<span class="evaluator-badge evaluator-badge-heuristic">Heuristic</span>';

    panel.innerHTML = `
      <div class="star-panel-header">
        <h3>STAR Answer Evaluation ${evaluatorBadge}</h3>
        <div class="star-total">
          <span class="star-total-score" id="star-total-score">${evaluation.totalScore}</span>
          <span class="star-total-max">/100</span>
          ${evaluation.isProvisional ? '<span class="star-provisional">Provisional</span>' : ''}
        </div>
      </div>
      <p class="star-panel-sub">${isAI ? 'AI-powered evaluation via Google Gemini.' : 'Heuristic evaluation — pattern matching, not AI.'}</p>
      <div class="star-breakdown" id="star-breakdown"></div>
      <div class="star-tip-box">
        <strong>Top improvement tip:</strong> <span id="star-tip"></span>
      </div>
      <div class="star-evaluator-note" id="star-evaluator-note"></div>
    `;

    // Per-criterion breakdown
    const breakdown = document.getElementById('star-breakdown');
    if (breakdown) {
      const criteria = ['situation', 'task', 'action', 'result', 'relevance'];
      breakdown.innerHTML = criteria.map(key => {
        const c = evaluation.criteria[key];
        if (!c) return '';
        const pct = Math.round((c.score / c.max) * 100);
        const evidenceHtml = c.evidence
          ? '<div class="star-evidence"><span class="star-evidence-label">Evidence:</span> "' + this.escapeHtml(c.evidence) + '"</div>'
          : '<div class="star-evidence star-evidence-none">No direct evidence detected.</div>';
        const missingHtml = c.missing
          ? '<div class="star-missing"><span class="star-missing-label">Missing:</span> ' + this.escapeHtml(c.missing) + '</div>'
          : '';
        const suggestionHtml = c.suggestion
          ? '<div class="star-suggestion"><span class="star-suggestion-label">Suggestion:</span> ' + this.escapeHtml(c.suggestion) + '</div>'
          : '';
        return `
          <div class="star-criterion">
            <div class="star-criterion-header">
              <span class="star-criterion-name">${c.label}</span>
              <span class="star-criterion-score">${c.score}<span class="star-criterion-max">/${c.max}</span></span>
            </div>
            <div class="star-criterion-bar"><div class="star-criterion-fill" style="width:${pct}%"></div></div>
            <div class="star-criterion-desc">${c.desc}</div>
            <div class="star-criterion-explanation">${this.escapeHtml(c.explanation)}</div>
            ${evidenceHtml}
            ${missingHtml}
            ${suggestionHtml}
          </div>
        `;
      }).join('');
    }

    // Top improvement tip
    const tipEl = document.getElementById('star-tip');
    if (tipEl) tipEl.innerHTML = this.escapeHtml(evaluation.improvementTip);

    // Evaluator note
    const noteEl = document.getElementById('star-evaluator-note');
    if (noteEl) noteEl.textContent = evaluation.evaluatorNote;
  },

  // ===== FOLLOW-UP QUESTION FLOW =====
  showFollowUp(followUp) {
    const area = document.getElementById('followup-area');
    if (!area) return;

    this.state.followUpActive = true;
    this.state.followUpQuestion = followUp.question;

    const qEl = document.getElementById('followup-question');
    if (qEl) qEl.textContent = followUp.question;

    const elementLabel = document.getElementById('followup-element');
    if (elementLabel) elementLabel.textContent = followUp.element;

    area.style.display = 'block';
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  async submitFollowUp() {
    const followUpText = document.getElementById('followup-answer-text').value.trim();
    if (!followUpText) {
      App.toast('Please type a follow-up answer or click "Skip & Continue".', 'error');
      return;
    }

    // Append follow-up to original answer
    const idx = this.state.currentIndex;
    const originalAnswer = this.state.answers[idx].answer;
    const combinedAnswer = originalAnswer + '\n\n[Follow-up answer] ' + followUpText;

    // Update the stored answer
    this.state.answers[idx].answer = combinedAnswer;
    const q = this.state.questions[idx];
    const jdText = App.state.jdText || '';

    // Update the answer text area
    const answerText = document.getElementById('answer-text');
    answerText.value = combinedAnswer;

    // Show loading state
    this.showEvaluationLoading();

    // Hide follow-up area
    document.getElementById('followup-area').style.display = 'none';
    this.state.followUpActive = false;

    // Try AI evaluation via backend API
    let evaluation = null;
    try {
      evaluation = await this.callEvaluateAPI(combinedAnswer, q.text, jdText);
    } catch (err) {
      console.warn('[Voxora] AI evaluation failed for follow-up, falling back to heuristic:', err.message);
    }

    // Fall back to heuristic
    if (!evaluation) {
      evaluation = StarEvaluator.evaluate(combinedAnswer, q.text, jdText);
      App.toast('Follow-up added — using heuristic evaluation.', '');
    } else {
      App.toast('Follow-up added — updated STAR feedback (Gemini AI).', 'success');
    }

    this.state.evaluations[idx] = evaluation;
    this.state.currentEvaluation = evaluation;

    // Show updated feedback
    this.showStarFeedback(evaluation);
    this.enableProceed();
  },

  skipFollowUp() {
    document.getElementById('followup-area').style.display = 'none';
    this.state.followUpActive = false;
    this.enableProceed();
    App.toast('Follow-up skipped. Proceeding to next question.', '');
  },

  // Enable the "Next Question" / "Submit & Finish" button after evaluation
  enableProceed() {
    const nextBtn = document.getElementById('next-btn');
    const skipBtn = document.getElementById('skip-btn');
    // Reset disabled state from loading
    nextBtn.disabled = false;
    nextBtn.style.opacity = '';
    nextBtn.classList.add('btn-ready');
    nextBtn.textContent = this.state.currentIndex < this.state.questions.length - 1
      ? 'Next Question →'
      : 'Finish & View Report →';
    // Switch next button to "proceed" mode via flag (no DOM cloning)
    this.state.readyToProceed = true;
    // Disable skip button since answer is already submitted
    if (skipBtn) skipBtn.style.opacity = '0.4';
    if (skipBtn) skipBtn.style.pointerEvents = 'none';

    // Re-enable follow-up submit button if it was disabled
    const followUpSubmit = document.getElementById('followup-submit-btn');
    if (followUpSubmit) {
      followUpSubmit.disabled = false;
      followUpSubmit.style.opacity = '';
    }
  },

  // ===== Dispatch next-button click based on current state =====
  // When readyToProceed is false, the button submits the current answer.
  // When true (set by enableProceed after evaluation), it advances to
  // the next question or finishes the interview. This replaces the
  // previous clone-and-rebind approach that destroyed the submit listener.
  handleNextClick() {
    if (this.state.readyToProceed) {
      this.proceedToNext();
    } else {
      this.submitAnswer();
    }
  },

  proceedToNext() {
    const idx = this.state.currentIndex;
    if (idx < this.state.questions.length - 1) {
      this.loadQuestion(idx + 1);
    } else {
      this.finishInterview();
    }
  },

  skipQuestion() {
    this.stopRecording();
    const q = this.state.questions[this.state.currentIndex];
    this.state.answers[this.state.currentIndex] = {
      questionId: q.id,
      questionText: q.text,
      questionCategory: q.category,
      answer: '[Skipped]'
    };
    // Create empty evaluation for skipped questions
    this.state.evaluations[this.state.currentIndex] = StarEvaluator.buildEmptyEvaluation(q.text);

    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.loadQuestion(this.state.currentIndex + 1);
      App.toast('Question skipped', '');
    } else {
      this.finishInterview();
    }
  },

  async finishInterview() {
    // Guard against double-calls (prevents duplicate session saves)
    if (!this.state.active) return;

    this.stopSpeaking();
    this.stopRecording(); // speech recognition
    this.stopMicStream();
    this.stopTimer();
    this.state.active = false;

    // Pass answers AND evaluations to feedback
    Feedback.render(this.state.answers, this.state.evaluations);

    // Save completed session to history (localStorage)
    const report = StarEvaluator.aggregateReport(
      this.state.evaluations,
      this.state.answers,
      App.state.jdText || ''
    );

    let sessionId = null;
    if (typeof History !== 'undefined') {
      sessionId = History.saveSession(
        this.state.answers,
        this.state.evaluations,
        report,
        {
          category: this.state.selectedCategory,
          jobRole: App.state.jobRole,
          experienceLevel: App.state.experienceLevel,
          questionCount: this.state.questionCount,
          mode: App.state.interviewMode,
          elapsedTime: this.state.elapsedTime,
          jdText: App.state.jdText || ''
        }
      );
    }

    App.navigate('feedback');
  },

  endInterview() {
    if (this.state.answers.filter(a => a && a.answer !== '[Skipped]').length === 0) {
      this.cleanup();
      App.navigate('setup');
      App.toast('Interview ended. No answers submitted.', '');
      return;
    }
    this.finishInterview();
  },

  // ===== TIMER =====
  startTimer() {
    this.state.elapsedTime = 0;
    this.state.timerInterval = setInterval(() => {
      this.state.elapsedTime++;
      this.updateTimerDisplay();
    }, 1000);
  },

  stopTimer() {
    if (this.state.timerInterval) {
      clearInterval(this.state.timerInterval);
      this.state.timerInterval = null;
    }
  },

  updateTimerDisplay() {
    const m = Math.floor(this.state.elapsedTime / 60);
    const s = this.state.elapsedTime % 60;
    const timerElem = document.getElementById('session-timer');
    if (timerElem) {
      timerElem.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
  },

  // ===== BIND CONTROLS =====
  bindControls() {
    const micBtn = document.getElementById('mic-btn');
    const skipBtn = document.getElementById('skip-btn');
    const nextBtn = document.getElementById('next-btn');
    const endBtn = document.getElementById('end-interview-btn');
    const readBtn = document.getElementById('read-question-btn');
    const followUpSubmit = document.getElementById('followup-submit-btn');
    const followUpSkip = document.getElementById('followup-skip-btn');

    // Clone to remove old listeners
    [micBtn, skipBtn, nextBtn, endBtn, readBtn, followUpSubmit, followUpSkip].forEach(btn => {
      if (!btn) return;
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
    });

    // Re-bind
    document.getElementById('mic-btn').addEventListener('click', () => this.toggleRecording());
    document.getElementById('skip-btn').addEventListener('click', () => this.skipQuestion());
    document.getElementById('next-btn').addEventListener('click', () => this.handleNextClick());
    document.getElementById('end-interview-btn').addEventListener('click', () => this.endInterview());
    document.getElementById('read-question-btn').addEventListener('click', () => this.toggleSpeak());
    const fSubmit = document.getElementById('followup-submit-btn');
    const fSkip = document.getElementById('followup-skip-btn');
    if (fSubmit) fSubmit.addEventListener('click', () => this.submitFollowUp());
    if (fSkip) fSkip.addEventListener('click', () => this.skipFollowUp());
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

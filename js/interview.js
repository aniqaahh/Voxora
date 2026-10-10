// ============================================================
// Voxora Interview Controller & Speech Engine
// Handles: Session setup, question shuffling (no repeats),
// random category selection (dice roll), speech recognition (STT),
// text-to-speech (TTS), camera preview, and answer persistence.
// ============================================================

const Interview = {
  state: {
    active: false,
    selectedCategory: 'general',
    questionCount: 3,
    currentIndex: 0,
    questions: [],
    answers: [], // Stores { questionId, questionText, answer }
    isRecording: false,
    recognition: null,
    speechSupported: false,
    ttsSupported: false,
    micStream: null,
    cameraStream: null,
    timerInterval: null,
    elapsedTime: 0
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
      modeLabel.textContent = App.state.interviewMode === 'camera' ? 'Voice + Camera' : 'Voice';
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
    this.stopCamera();
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
    const existing = this.state.answers[index];
    answerText.value = existing ? existing.answer : '';

    this.updateStatus('Ready to answer');
    this.resetMicButton();

    const nextBtn = document.getElementById('next-btn');
    if (index === this.state.questions.length - 1) {
      nextBtn.textContent = 'Submit & Finish →';
    } else {
      nextBtn.textContent = 'Submit Answer →';
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

  // ===== CAMERA PREVIEW =====
  async startCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      this.state.cameraStream = stream;
      const video = document.getElementById('camera-video');
      if (video) video.srcObject = stream;
      App.toast('Camera enabled', 'success');
    } catch(err) {
      App.toast('Camera unavailable. Voice interview still works.', 'error');
    }
  },

  stopCamera() {
    if (this.state.cameraStream) {
      this.state.cameraStream.getTracks().forEach(t => t.stop());
      this.state.cameraStream = null;
    }
  },

  // ===== SUBMISSION FLOW =====
  submitAnswer() {
    this.stopRecording();
    const answerText = document.getElementById('answer-text');
    const answer = answerText ? answerText.value.trim() : '';

    if (!answer) {
      App.toast('Please record or type an answer before submitting.', 'error');
      return;
    }

    const currentQ = this.state.questions[this.state.currentIndex];
    this.state.answers[this.state.currentIndex] = {
      questionId: currentQ.id,
      questionText: currentQ.text,
      answer: answer
    };

    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.loadQuestion(this.state.currentIndex + 1);
      App.toast('Answer saved', 'success');
    } else {
      this.finishInterview();
    }
  },

  skipQuestion() {
    this.stopRecording();
    const currentQ = this.state.questions[this.state.currentIndex];
    this.state.answers[this.state.currentIndex] = {
      questionId: currentQ.id,
      questionText: currentQ.text,
      answer: '[Skipped]'
    };

    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.loadQuestion(this.state.currentIndex + 1);
      App.toast('Question skipped', '');
    } else {
      this.finishInterview();
    }
  },

  finishInterview() {
    this.cleanup();
    Feedback.render(this.state.answers, this.state.selectedCategory);
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

    [micBtn, skipBtn, nextBtn, endBtn, readBtn].forEach(btn => {
      if (!btn) return;
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
    });

    const newMic = document.getElementById('mic-btn');
    const newSkip = document.getElementById('skip-btn');
    const newNext = document.getElementById('next-btn');
    const newEnd = document.getElementById('end-interview-btn');
    const newRead = document.getElementById('read-question-btn');

    if (newMic) newMic.addEventListener('click', () => this.toggleRecording());
    if (newSkip) newSkip.addEventListener('click', () => this.skipQuestion());
    if (newNext) newNext.addEventListener('click', () => this.submitAnswer());
    if (newEnd) newEnd.addEventListener('click', () => this.endInterview());
    if (newRead) newRead.addEventListener('click', () => this.toggleSpeak());
  }
};
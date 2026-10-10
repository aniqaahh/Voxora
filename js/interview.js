// ============================================================
// Voxora Interview Interface
// Handles: question display, microphone + speech recognition,
// camera preview, text answer fallback, session timer.
// ============================================================

const Interview = {
  state: {
    active: false,
    currentIndex: 0,
    questions: MOCK_QUESTIONS,
    answers: [],
    isRecording: false,
    recognition: null,
    speechSupported: false,
    ttsSupported: false,
    micStream: null,
    cameraStream: null,
    timerInterval: null,
    elapsedTime: 0
  },

  // ===== LIFECYCLE =====
  start() {
    this.state.active = true;
    this.state.currentIndex = 0;
    this.state.answers = [];
    this.state.elapsedTime = 0;

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

    // Check speech synthesis (text-to-speech) support
    this.state.ttsSupported = typeof window.speechSynthesis !== 'undefined' &&
      typeof window.speechSynthesis.speak === 'function';

    // Show/hide "Read Question" button based on TTS support
    const readBtn = document.getElementById('read-question-btn');
    if (readBtn) {
      readBtn.style.display = this.state.ttsSupported ? 'inline-flex' : 'none';
    }

    // Show/hide camera card based on mode
    const cameraCard = document.getElementById('camera-card');
    if (App.state.interviewMode === 'camera') {
      cameraCard.style.display = 'block';
    } else {
      cameraCard.style.display = 'none';
    }

    // Update session info
    document.getElementById('session-mode').textContent =
      App.state.interviewMode === 'camera' ? 'Voice + Camera' : 'Voice';
    document.getElementById('session-resume').textContent =
      App.state.resumeFileName || 'Text pasted';
    document.getElementById('session-questions').textContent =
      this.state.questions.length;
    document.getElementById('question-total').textContent =
      this.state.questions.length;

    // Bind controls
    this.bindControls();

    // Start timer
    this.startTimer();

    // Load first question
    this.loadQuestion(0);
  },

  cleanup() {
    this.state.active = false;
    this.stopSpeaking();
    this.stopRecording();
    this.stopMicStream();
    this.stopCamera();
    this.stopTimer();
  },

  // ===== QUESTION =====
  loadQuestion(index) {
    this.state.currentIndex = index;
    const q = this.state.questions[index];
    if (!q) return;

    // Stop any ongoing TTS from previous question
    this.stopSpeaking();

    document.getElementById('question-current').textContent = index + 1;
    document.getElementById('question-text').textContent = q.text;

    // Reset answer area
    const answerText = document.getElementById('answer-text');
    answerText.value = '';
    this.updateStatus('Ready to answer');

    // Reset mic button
    this.resetMicButton();

    // Update next button text on last question
    const nextBtn = document.getElementById('next-btn');
    if (index === this.state.questions.length - 1) {
      nextBtn.textContent = 'Submit & Finish →';
    } else {
      nextBtn.textContent = 'Submit Answer →';
    }
  },

  // ===== MIC / SPEECH =====
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
        this.setRecordingUI(false);
      } else if (errType === 'audio-capture') {
        this.updateStatus('No microphone detected. Type your answer below.');
        App.toast('No microphone found. You can type your answer instead.', 'error');
        this.setRecordingUI(false);
      } else if (errType === 'network') {
        this.updateStatus('Network error with speech service. Type your answer below.');
        App.toast('Network error. You can type your answer instead.', 'error');
        this.setRecordingUI(false);
      } else if (errType === 'aborted') {
        // User stopped — no error message needed
      } else if (errType === 'no-speech') {
        // Auto-restart will handle this — no UI change
      } else if (errType === 'audio-busy') {
        this.updateStatus('Microphone busy. Close other apps using it, then try again.');
        App.toast('Microphone is in use by another app. Type your answer or try again.', 'error');
        this.setRecordingUI(false);
      } else {
        this.updateStatus('Speech recognition error (' + errType + '). Type your answer.');
        this.setRecordingUI(false);
      }
    };

    rec.onend = () => {
      if (this.state.isRecording) {
        // Auto-restart if still recording (keeps listening)
        try { rec.start(); } catch(e) { /* already started */ }
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
      App.toast('Speech recognition not supported in this browser. Please type your answer.', 'error');
      this.updateStatus('Speech not supported. Type your answer below.');
      return;
    }

    // Stop any ongoing TTS before recording
    this.stopSpeaking();

    // Check secure context (HTTPS or localhost)
    if (!window.isSecureContext) {
      App.toast('Microphone requires HTTPS or localhost. The current page is not in a secure context. Type your answer below.', 'error');
      this.updateStatus('Not a secure context (needs HTTPS). Type your answer.');
      return;
    }

    // Check navigator.mediaDevices existence
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      App.toast('Browser does not support microphone API. Type your answer below.', 'error');
      this.updateStatus('Microphone API unavailable. Type your answer.');
      return;
    }

    // Check iframe restriction
    if (window.self !== window.top) {
      // Running inside an iframe — may need allow="microphone" on the iframe
      console.warn('[Voxora] Running inside an iframe. If mic fails, the parent page must set allow="microphone" on the iframe.');
    }

    // Request mic permission explicitly via getUserMedia first
    // (this also verifies the device exists before starting speech recognition)
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        // Store the stream so we can release tracks later
        this.state.micStream = stream;
        this.state.isRecording = true;
        this.updateStatus('Listening... Speak now');
        try {
          this.state.recognition.start();
        } catch(e) {
          // Already started — not a fatal error
          console.warn('[Voxora] Speech recognition already started:', e.message);
        }
      })
      .catch((err) => {
        this.handleMicError(err);
      });
  },

  // Handle specific getUserMedia error types with clear user guidance
  handleMicError(err) {
    const name = err && err.name ? err.name : 'UnknownError';

    if (name === 'NotAllowedError' || name === 'SecurityError') {
      // Permission denied or blocked by browser/iframe policy
      const iframeNote = (window.self !== window.top)
        ? ' This may be because the preview iframe blocks microphone. Open Voxora directly in a browser tab.'
        : ' Check your browser microphone permissions for this site.';
      App.toast('Microphone permission denied.' + iframeNote + ' You can type your answer instead.', 'error');
      this.updateStatus('Mic permission denied. Type your answer below.');
    } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      App.toast('No microphone found. Connect a microphone or type your answer below.', 'error');
      this.updateStatus('No microphone detected. Type your answer below.');
    } else if (name === 'NotReadableError' || name === 'TrackStartError') {
      App.toast('Microphone is in use by another app. Close it and try again, or type your answer.', 'error');
      this.updateStatus('Mic busy. Close other apps using it. Or type below.');
    } else if (name === 'OverconstrainedError') {
      App.toast('Microphone does not meet constraints. Type your answer below.', 'error');
      this.updateStatus('Mic constraints error. Type your answer below.');
    } else if (name === 'TypeError') {
      App.toast('Microphone API not available in this context. Type your answer below.', 'error');
      this.updateStatus('Mic API unavailable. Type your answer below.');
    } else {
      App.toast('Microphone error: ' + name + '. Type your answer below.', 'error');
      this.updateStatus('Mic error (' + name + '). Type your answer below.');
    }
    this.setRecordingUI(false);
  },

  // Release the microphone stream tracks
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

  // ===== SPEECH SYNTHESIS (Text-to-Speech) =====
  speakQuestion() {
    if (!this.state.ttsSupported) {
      App.toast('Text-to-speech not supported in this browser.', 'error');
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    const q = this.state.questions[this.state.currentIndex];
    if (!q) return;

    const utterance = new SpeechSynthesisUtterance(q.text);
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    utterance.lang = 'en-US';

    // Try to use a natural-sounding English voice
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(v =>
      v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha'))
    ) || voices.find(v => v.lang.startsWith('en'));
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    utterance.onstart = () => {
      this.updateStatus('Reading question aloud...');
      const btn = document.getElementById('read-question-btn');
      if (btn) btn.textContent = 'Stop Reading';
    };

    utterance.onend = () => {
      const btn = document.getElementById('read-question-btn');
      if (btn) btn.textContent = 'Read Question';
      if (!this.state.isRecording) {
        this.updateStatus('Ready to answer');
      }
    };

    utterance.onerror = () => {
      const btn = document.getElementById('read-question-btn');
      if (btn) btn.textContent = 'Read Question';
      if (!this.state.isRecording) {
        this.updateStatus('Ready to answer');
      }
    };

    window.speechSynthesis.speak(utterance);
  },

  stopSpeaking() {
    if (this.state.ttsSupported && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    const btn = document.getElementById('read-question-btn');
    if (btn) btn.textContent = 'Read Question';
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
    status.textContent = text;
    if (text.includes('Listening')) {
      status.classList.add('recording');
    } else {
      status.classList.remove('recording');
    }
  },

  // ===== CAMERA =====
  async startCamera() {
    const overlay = document.getElementById('camera-overlay');

    // Check secure context
    if (!window.isSecureContext) {
      App.toast('Camera requires HTTPS or localhost. The current page is not in a secure context.', 'error');
      return;
    }

    // Check mediaDevices
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      App.toast('Browser does not support camera API.', 'error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false
      });
      this.state.cameraStream = stream;
      const video = document.getElementById('camera-video');
      video.srcObject = stream;
      overlay.style.display = 'none';
      App.toast('Camera enabled', 'success');
    } catch(err) {
      const name = err && err.name ? err.name : 'UnknownError';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        const note = (window.self !== window.top)
          ? ' Camera may be blocked by the preview iframe. Open Voxora directly in a browser tab.'
          : '';
        App.toast('Camera permission denied.' + note + ' Voice interview still works.', 'error');
      } else if (name === 'NotFoundError') {
        App.toast('No camera found. Voice interview still works.', 'error');
      } else if (name === 'NotReadableError') {
        App.toast('Camera is in use by another app. Voice interview still works.', 'error');
      } else {
        App.toast('Camera error: ' + name + '. Voice interview still works.', 'error');
      }
    }
  },

  stopCamera() {
    if (this.state.cameraStream) {
      this.state.cameraStream.getTracks().forEach(t => t.stop());
      this.state.cameraStream = null;
      const video = document.getElementById('camera-video');
      video.srcObject = null;
      const overlay = document.getElementById('camera-overlay');
      if (overlay) overlay.style.display = 'flex';
    }
  },

  // ===== ANSWER FLOW =====
  submitAnswer() {
    this.stopRecording();
    const answerText = document.getElementById('answer-text');
    const answer = answerText.value.trim();

    if (!answer) {
      App.toast('Please record or type an answer before submitting.', 'error');
      return;
    }

    this.state.answers[this.state.currentIndex] = {
      questionId: this.state.questions[this.state.currentIndex].id,
      questionText: this.state.questions[this.state.currentIndex].text,
      answer: answer
    };

    // Next question or finish
    if (this.state.currentIndex < this.state.questions.length - 1) {
      this.loadQuestion(this.state.currentIndex + 1);
      App.toast('Answer saved', 'success');
    } else {
      this.finishInterview();
    }
  },

  skipQuestion() {
    this.stopRecording();
    this.state.answers[this.state.currentIndex] = {
      questionId: this.state.questions[this.state.currentIndex].id,
      questionText: this.state.questions[this.state.currentIndex].text,
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
    this.stopSpeaking();
    this.stopRecording();
    this.stopMicStream();
    this.stopCamera();
    this.stopTimer();
    this.state.active = false;

    // Pass answers to feedback
    Feedback.render(this.state.answers);
    App.navigate('feedback');
  },

  endInterview() {
    if (this.state.answers.filter(a => a).length === 0) {
      // No answers submitted
      this.cleanup();
      App.navigate('setup');
      App.toast('Interview ended. No answers were submitted.', '');
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
    document.getElementById('session-timer').textContent =
      `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  },

  // ===== BIND =====
  bindControls() {
    // Avoid double-binding by removing and re-adding listeners
    const micBtn = document.getElementById('mic-btn');
    const cameraStart = document.getElementById('camera-start-btn');
    const skipBtn = document.getElementById('skip-btn');
    const nextBtn = document.getElementById('next-btn');
    const endBtn = document.getElementById('end-interview-btn');
    const readBtn = document.getElementById('read-question-btn');

    // Clone to remove old listeners
    [micBtn, cameraStart, skipBtn, nextBtn, endBtn, readBtn].forEach(btn => {
      const clone = btn.cloneNode(true);
      btn.parentNode.replaceChild(clone, btn);
    });

    // Re-bind
    document.getElementById('mic-btn').addEventListener('click', () => this.toggleRecording());
    document.getElementById('camera-start-btn').addEventListener('click', () => this.startCamera());
    document.getElementById('skip-btn').addEventListener('click', () => this.skipQuestion());
    document.getElementById('next-btn').addEventListener('click', () => this.submitAnswer());
    document.getElementById('end-interview-btn').addEventListener('click', () => this.endInterview());
    document.getElementById('read-question-btn').addEventListener('click', () => this.toggleSpeak());
  }
};

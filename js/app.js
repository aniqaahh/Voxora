// ============================================================
// Voxora App — Navigation, Setup, State Management
// ============================================================

const App = {
  state: {
    currentView: 'landing',
    resumeText: '',
    resumeFileName: '',
    jdText: '',
    interviewMode: 'voice',
    currentQuestionIndex: 0,
    answers: [],
    timerInterval: null,
    elapsedTime: 0
  },

  init() {
    this.bindNav();
    this.bindSetup();
    this.navigate('landing');
  },

  // ===== NAV =====
  bindNav() {
    // Any element with data-view navigates
    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const view = el.getAttribute('data-view');
        this.navigate(view);
      });
    });

    // Mobile nav toggle
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('active');
      navLinks.classList.toggle('mobile-open');
    });

    // Hero "How it works" scroll
    document.getElementById('hero-learn').addEventListener('click', () => {
      document.getElementById('how-it-works').scrollIntoView({ behavior: 'smooth' });
    });
  },

  navigate(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
    const target = document.getElementById('view-' + view);
    if (target) {
      target.classList.add('view-active');
      this.state.currentView = view;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Close mobile menu
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    navToggle.classList.remove('active');
    navLinks.classList.remove('mobile-open');

    // Lifecycle hooks
    if (view === 'interview') {
      Interview.start();
    } else if (view !== 'interview' && Interview.state.active) {
      Interview.cleanup();
    }
  },

  // ===== SETUP =====
  bindSetup() {
    // Mode selection
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('mode-card-active'));
        card.classList.add('mode-card-active');
        const radio = card.querySelector('input[type="radio"]');
        radio.checked = true;
        this.state.interviewMode = radio.value;
      });
    });

    // Resume file upload
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('resume-file');
    const fileInfo = document.getElementById('resume-file-info');

    uploadZone.addEventListener('click', () => fileInput.click());

    uploadZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadZone.classList.remove('dragover');
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        this.handleResumeFile(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) {
        this.handleResumeFile(fileInput.files[0]);
      }
    });

    // Resume text change
    document.getElementById('resume-text').addEventListener('input', (e) => {
      this.state.resumeText = e.target.value;
    });

    // JD text change
    document.getElementById('jd-text').addEventListener('input', (e) => {
      this.state.jdText = e.target.value;
    });

    // JD sample
    document.getElementById('jd-sample-btn').addEventListener('click', () => {
      document.getElementById('jd-text').value = SAMPLE_JD;
      this.state.jdText = SAMPLE_JD;
      this.toast('Sample job description loaded', 'success');
    });

    // Start interview
    document.getElementById('start-interview-btn').addEventListener('click', () => {
      if (this.validateSetup()) {
        this.navigate('interview');
      }
    });
  },

  handleResumeFile(file) {
    const fileInfo = document.getElementById('resume-file-info');
    if (file.size > 5 * 1024 * 1024) {
      this.toast('File too large. Max 5MB.', 'error');
      return;
    }
    if (file.type !== 'application/pdf') {
      this.toast('Please upload a PDF file.', 'error');
      return;
    }
    this.state.resumeFileName = file.name;
    this.state.resumeText = `[PDF uploaded: ${file.name} — ${this.formatSize(file.size)}]`;

    // Show file info
    fileInfo.classList.remove('hidden');
    fileInfo.innerHTML = `
      <span class="file-icon">📄</span>
      <span class="file-name">${file.name}</span>
      <span class="file-size">${this.formatSize(file.size)}</span>
      <span class="file-remove" id="file-remove">&times;</span>
    `;
    document.getElementById('file-remove').addEventListener('click', () => {
      this.state.resumeFileName = '';
      this.state.resumeText = '';
      document.getElementById('resume-file').value = '';
      fileInfo.classList.add('hidden');
      fileInfo.innerHTML = '';
    });

    this.toast(`Resume uploaded: ${file.name}`, 'success');
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  validateSetup() {
    const resumeText = document.getElementById('resume-text').value.trim();
    const jdText = document.getElementById('jd-text').value.trim();

    if (!this.state.resumeText && resumeText.length < 10) {
      this.toast('Please upload a resume PDF or paste your resume text.', 'error');
      return false;
    }
    // Update state from textarea if file not used
    if (!this.state.resumeText && resumeText) {
      this.state.resumeText = resumeText;
    }
    if (jdText.length < 20) {
      this.toast('Please paste a job description (at least a few sentences).', 'error');
      return false;
    }
    this.state.jdText = jdText;
    return true;
  },

  // ===== TOAST =====
  toast(message, type = '') {
    const t = document.getElementById('toast');
    t.textContent = message;
    t.className = 'toast show toast-' + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.className = 'toast';
    }, 3500);
  }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());

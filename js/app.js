// ============================================================
// Voxora App — Navigation, Setup, & State Controller
// Handles view switching, category selection, dice roll trigger,
// setup validation, and session parameters.
// ============================================================

const App = {
  state: {
    currentView: 'landing',
    selectedCategory: 'general',
    jobRole: 'Software Engineer',
    experienceLevel: 'fresh_grad',
    questionCount: 3,
    resumeText: '',
    resumeFileName: '',
    jdText: '',
    interviewMode: 'voice'
  },

  init() {
    this.bindNav();
    this.bindSetup();
    this.navigate('landing');
  },

  // ===== NAVIGATION CONTROLLER =====
  bindNav() {
    document.querySelectorAll('[data-view]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const view = el.getAttribute('data-view');
        this.navigate(view);
      });
    });

    // Mobile navigation toggle
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle && navLinks) {
      navToggle.addEventListener('click', () => {
        navToggle.classList.toggle('active');
        navLinks.classList.toggle('mobile-open');
      });
    }

    // Hero "How it works" scroll anchor
    const heroLearn = document.getElementById('hero-learn');
    if (heroLearn) {
      heroLearn.addEventListener('click', () => {
        const section = document.getElementById('how-it-works');
        if (section) section.scrollIntoView({ behavior: 'smooth' });
      });
    }
  },

  navigate(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('view-active'));
    const target = document.getElementById('view-' + view);
    if (target) {
      target.classList.add('view-active');
      this.state.currentView = view;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Close mobile menu on navigation
    const navToggle = document.getElementById('nav-toggle');
    const navLinks = document.querySelector('.nav-links');
    if (navToggle && navLinks) {
      navToggle.classList.remove('active');
      navLinks.classList.remove('mobile-open');
    }

    // Session lifecycle management
    if (view === 'interview') {
      Interview.start({
        category: this.state.selectedCategory,
        questionCount: this.state.questionCount,
        jobRole: this.state.jobRole,
        experienceLevel: this.state.experienceLevel
      });
    } else if (view !== 'interview' && Interview.state.active) {
      Interview.cleanup();
    }
  },

  // ===== SETUP & FORM BINDINGS =====
  bindSetup() {
    // 1. Category Dropdown Listener
    const categorySelect = document.getElementById('category-select');
    const categoryDesc = document.getElementById('category-description');
    
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.state.selectedCategory = e.target.value;
        if (categoryDesc && typeof CATEGORY_DESCRIPTIONS !== 'undefined') {
          categoryDesc.textContent = CATEGORY_DESCRIPTIONS[e.target.value] || '';
        }
      });
    }

    // 2. Random Dice Roll Listener
    const diceBtn = document.getElementById('dice-roll-btn');
    if (diceBtn) {
      diceBtn.addEventListener('click', () => {
        const rolledCategory = Interview.rollRandomCategory();
        this.state.selectedCategory = rolledCategory;
        this.toast(`🎲 Rolled Category: ${rolledCategory.toUpperCase()}`, 'success');
      });
    }

    // 3. Experience & Question Count Inputs
    const roleInput = document.getElementById('job-role-input');
    if (roleInput) {
      roleInput.addEventListener('input', (e) => {
        this.state.jobRole = e.target.value;
      });
    }

    const expSelect = document.getElementById('experience-level-select');
    if (expSelect) {
      expSelect.addEventListener('change', (e) => {
        this.state.experienceLevel = e.target.value;
      });
    }

    const countSelect = document.getElementById('question-count-select');
    if (countSelect) {
      countSelect.addEventListener('change', (e) => {
        this.state.questionCount = parseInt(e.target.value, 10) || 3;
      });
    }

    // 4. Mode Selection Cards
    document.querySelectorAll('.mode-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('mode-card-active'));
        card.classList.add('mode-card-active');
        const radio = card.querySelector('input[type="radio"]');
        if (radio) {
          radio.checked = true;
          this.state.interviewMode = radio.value;
        }
      });
    });

    // 5. Resume File Upload
    const uploadZone = document.getElementById('upload-zone');
    const fileInput = document.getElementById('resume-file');

    if (uploadZone && fileInput) {
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
    }

    // Text inputs
    const resumeArea = document.getElementById('resume-text');
    if (resumeArea) {
      resumeArea.addEventListener('input', (e) => {
        this.state.resumeText = e.target.value;
      });
    }

    const jdArea = document.getElementById('jd-text');
    if (jdArea) {
      jdArea.addEventListener('input', (e) => {
        this.state.jdText = e.target.value;
      });
    }

    const sampleBtn = document.getElementById('jd-sample-btn');
    if (sampleBtn && typeof SAMPLE_JD !== 'undefined') {
      sampleBtn.addEventListener('click', () => {
        const jdElem = document.getElementById('jd-text');
        if (jdElem) {
          jdElem.value = SAMPLE_JD;
          this.state.jdText = SAMPLE_JD;
          this.toast('Sample job description loaded', 'success');
        }
      });
    }

    // Start Button
    const startBtn = document.getElementById('start-interview-btn');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (this.validateSetup()) {
          this.navigate('interview');
        }
      });
    }
  },

  async handleResumeFile(file) {
    const fileInfo = document.getElementById('resume-file-info');

    // ---- Validation ----
    if (file.size > 5 * 1024 * 1024) {
      this.toast('File too large. Maximum size is 5MB.', 'error');
      return;
    }
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.toast('Please upload a PDF file.', 'error');
      return;
    }

    // ---- Check PDF.js availability ----
    if (typeof pdfjsLib === 'undefined') {
      this.toast('PDF library failed to load. Please paste resume text manually.', 'error');
      this.state.resumeFileName = file.name;
      this.state.resumeText = '';
      return;
    }

    this.state.resumeFileName = file.name;

    // ---- Show loading state ----
    if (fileInfo) {
      fileInfo.classList.remove('hidden');
      fileInfo.innerHTML = `
        <span class="file-icon">📄</span>
        <span class="file-name">${file.name}</span>
        <span class="file-size">${this.formatSize(file.size)}</span>
        <span class="file-extracting">Extracting text…</span>
      `;
    }
    this.toast(`Reading ${file.name}…`, '');

    try {
      // ---- Read file as ArrayBuffer ----
      const arrayBuffer = await file.arrayBuffer();

      // ---- Load PDF with PDF.js ----
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdfDoc.numPages;
      const pageTexts = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (pageText) pageTexts.push(pageText);
      }

      const extractedText = pageTexts.join('\n\n').trim();

      if (!extractedText) {
        // PDF has no selectable text (likely scanned/image-based)
        this.state.resumeText = '';
        if (fileInfo) {
          fileInfo.innerHTML = `
            <span class="file-icon">📄</span>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${this.formatSize(file.size)}</span>
            <span class="file-warning">No text found — paste manually</span>
            <span class="file-remove" id="file-remove">&times;</span>
          `;
          this.bindFileRemove(fileInfo);
        }
        this.toast('No selectable text found in this PDF (it may be scanned). Please paste your resume text below.', 'error');
        return;
      }

      // ---- Store extracted text ----
      this.state.resumeText = extractedText;

      // ---- Populate the textarea so the user can review/edit ----
      const resumeTextarea = document.getElementById('resume-text');
      if (resumeTextarea) {
        resumeTextarea.value = extractedText;
      }

      // ---- Show success state with extracted info ----
      const preview = extractedText.substring(0, 60).replace(/\n/g, ' ');
      if (fileInfo) {
        fileInfo.innerHTML = `
          <span class="file-icon">📄</span>
          <span class="file-name">${file.name}</span>
          <span class="file-size">${this.formatSize(file.size)}</span>
          <span class="file-extracted">${numPages} page${numPages > 1 ? 's' : ''} · ${extractedText.length} chars extracted</span>
          <span class="file-remove" id="file-remove">&times;</span>
        `;
        this.bindFileRemove(fileInfo);
      }

      this.toast(`Resume parsed: ${numPages} page${numPages > 1 ? 's' : ''}, ${extractedText.length} characters extracted`, 'success');

    } catch (err) {
      console.error('PDF parsing error:', err);
      this.state.resumeText = '';
      if (fileInfo) {
        fileInfo.innerHTML = `
          <span class="file-icon">📄</span>
          <span class="file-name">${file.name}</span>
          <span class="file-size">${this.formatSize(file.size)}</span>
          <span class="file-warning">Parse failed — paste manually</span>
          <span class="file-remove" id="file-remove">&times;</span>
        `;
        this.bindFileRemove(fileInfo);
      }
      this.toast('Could not read this PDF. Please paste your resume text manually.', 'error');
    }
  },

  bindFileRemove(fileInfo) {
    const removeBtn = document.getElementById('file-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        this.state.resumeFileName = '';
        this.state.resumeText = '';
        const fileInput = document.getElementById('resume-file');
        if (fileInput) fileInput.value = '';
        const resumeTextarea = document.getElementById('resume-text');
        if (resumeTextarea) resumeTextarea.value = '';
        fileInfo.classList.add('hidden');
        fileInfo.innerHTML = '';
      });
    }
  },

  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  validateSetup() {
    if (!this.state.selectedCategory) {
      this.toast('Please select an interview category.', 'error');
      return false;
    }
    return true;
  },

  // ===== TOAST NOTIFICATION =====
  toast(message, type = '') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = message;
    t.className = 'toast show toast-' + type;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      t.className = 'toast';
    }, 3500);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
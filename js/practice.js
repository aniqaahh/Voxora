// ============================================================
// Voxora Practice & Retry Workflow
// ============================================================
// Allows the user to select an answer from the feedback report,
// review its STAR evaluation, type a revised version, and have
// the revised answer re-evaluated with the same rubric.
//
// Shows a side-by-side comparison of original vs revised scores.
// Does NOT guarantee that a higher score predicts real interview
// success — this is a practice tool for self-improvement.
// ============================================================

const Practice = {

  state: {
    active: false,
    questionIndex: -1,
    originalAnswer: '',
    originalEvaluation: null,
    revisedEvaluation: null,
    questionText: '',
    jdText: ''
  },

  // ===== Start practice for a specific question =====
  start(questionIndex) {
    this.state.active = true;
    this.state.questionIndex = questionIndex;
    this.state.revisedEvaluation = null;

    // Get the original answer and evaluation from Feedback
    const ans = Feedback.answers[questionIndex];
    const evalResult = Feedback.evaluations[questionIndex];

    if (!ans || !evalResult) {
      App.toast('Unable to load this answer for practice.', 'error');
      return;
    }

    this.state.originalAnswer = ans.answer;
    this.state.originalEvaluation = evalResult;
    this.state.questionText = ans.questionText;
    this.state.jdText = App.state.jdText || '';

    // Navigate to practice view
    App.navigate('practice');

    // Render the practice view
    this.render();
  },

  // ===== Render the practice view =====
  render() {
    // Question
    const qEl = document.getElementById('practice-question');
    if (qEl) qEl.textContent = this.state.questionText;

    // Original answer
    const origEl = document.getElementById('practice-original-answer');
    if (origEl) {
      origEl.textContent = this.state.originalAnswer === '[Skipped]'
        ? '(Skipped — no original answer)'
        : this.state.originalAnswer;
    }

    // Original STAR scores
    this.renderOriginalScores(this.state.originalEvaluation);

    // Clear revised answer area
    const revisedEl = document.getElementById('practice-revised-answer');
    if (revisedEl) revisedEl.value = '';

    // Clear comparison section
    const compEl = document.getElementById('practice-comparison');
    if (compEl) compEl.innerHTML = '';

    // Reset re-evaluate button
    const reEvalBtn = document.getElementById('practice-reevaluate-btn');
    if (reEvalBtn) {
      reEvalBtn.textContent = 'Re-evaluate Revised Answer';
      reEvalBtn.disabled = false;
    }
  },

  // ===== Render original STAR scores in the practice view =====
  renderOriginalScores(evaluation) {
    const container = document.getElementById('practice-original-star');
    if (!container || !evaluation) return;

    const keys = ['situation', 'task', 'action', 'result', 'relevance'];
    container.innerHTML = `
      <div class="practice-score-total">
        <span class="practice-score-num">${evaluation.totalScore}</span>
        <span class="practice-score-max">/100</span>
        ${evaluation.isProvisional ? '<span class="practice-provisional">Provisional</span>' : ''}
      </div>
      <div class="practice-criteria">
        ${keys.map(k => {
          const c = evaluation.criteria[k];
          if (!c) return '';
          const pct = Math.round((c.score / c.max) * 100);
          return `
            <div class="practice-criterion">
              <span class="practice-criterion-label">${c.label}</span>
              <div class="practice-criterion-bar"><div class="practice-criterion-fill" style="width:${pct}%"></div></div>
              <span class="practice-criterion-score">${c.score}/${c.max}</span>
            </div>
          `;
        }).join('')}
      </div>
      <div class="practice-tip">
        <strong>Top tip:</strong> ${this.escapeHtml(evaluation.improvementTip)}
      </div>
    `;
  },

  // ===== Re-evaluate the revised answer =====
  async reEvaluate() {
    const revisedText = document.getElementById('practice-revised-answer').value.trim();

    if (!revisedText || revisedText.length < 10) {
      App.toast('Please type a revised answer (at least a sentence).', 'error');
      return;
    }

    // Show loading state on the re-evaluate button
    const reEvalBtn = document.getElementById('practice-reevaluate-btn');
    if (reEvalBtn) {
      reEvalBtn.disabled = true;
      reEvalBtn.style.opacity = '0.5';
      reEvalBtn.textContent = 'Evaluating with AI...';
    }

    // Show loading in comparison area
    const compEl = document.getElementById('practice-comparison');
    if (compEl) {
      compEl.innerHTML = `
        <div class="star-loading">
          <div class="star-loading-spinner"></div>
          <p class="star-loading-text">Evaluating your revised answer with AI...</p>
          <p class="star-loading-sub">This may take a few seconds.</p>
        </div>
      `;
    }

    // Try AI evaluation via backend API
    let evaluation = null;
    try {
      evaluation = await this.callEvaluateAPI(revisedText);
    } catch (err) {
      console.warn('[Voxora] AI evaluation failed for practice, falling back to heuristic:', err.message);
    }

    // Fall back to heuristic
    if (!evaluation) {
      evaluation = StarEvaluator.evaluate(
        revisedText,
        this.state.questionText,
        this.state.jdText
      );
      App.toast('Revised answer evaluated — using heuristic (AI unavailable).', '');
    } else {
      App.toast('Revised answer evaluated by Gemini AI — see comparison below.', 'success');
    }

    this.state.revisedEvaluation = evaluation;

    // Reset button
    if (reEvalBtn) {
      reEvalBtn.disabled = false;
      reEvalBtn.style.opacity = '';
      reEvalBtn.textContent = 'Re-evaluate Revised Answer';
    }

    // Render the comparison
    this.renderComparison(this.state.originalEvaluation, evaluation, revisedText);
  },

  // ===== Call backend /api/evaluate endpoint =====
  async callEvaluateAPI(answer) {
    const response = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answer: answer,
        question: this.state.questionText,
        jd: this.state.jdText || ''
      })
    });

    if (!response.ok) {
      throw new Error('HTTP ' + response.status);
    }

    const data = await response.json();

    if (data.fallback) {
      console.info('[Voxora] Backend recommended fallback:', data.reason);
      return null;
    }

    if (!data.success || !data.evaluation) {
      throw new Error('Unexpected response format from server');
    }

    return data.evaluation;
  },

  // ===== Render side-by-side comparison =====
  renderComparison(original, revised, revisedText) {
    const container = document.getElementById('practice-comparison');
    if (!container) return;

    const keys = ['situation', 'task', 'action', 'result', 'relevance'];
    const scoreDiff = revised.totalScore - original.totalScore;

    // Determine what improved
    const improvements = [];
    const regressions = [];
    for (const k of keys) {
      const o = original.criteria[k];
      const r = revised.criteria[k];
      if (!o || !r) continue;
      const diff = r.score - o.score;
      if (diff > 0) {
        improvements.push(o.label + ' +' + diff + ' (' + o.score + '→' + r.score + '/' + r.max + ')');
      } else if (diff < 0) {
        regressions.push(o.label + ' ' + diff + ' (' + o.score + '→' + r.score + '/' + r.max + ')');
      }
    }

    // Build the comparison HTML
    let html = `
      <div class="comparison-header">
        <h4>Score Comparison</h4>
      </div>

      <div class="comparison-totals">
        <div class="comparison-total-card comparison-original">
          <div class="comparison-total-label">Original</div>
          <div class="comparison-total-score">${original.totalScore}</div>
          <div class="comparison-total-max">/100</div>
        </div>
        <div class="comparison-arrow">→</div>
        <div class="comparison-total-card comparison-revised">
          <div class="comparison-total-label">Revised</div>
          <div class="comparison-total-score">${revised.totalScore}</div>
          <div class="comparison-total-max">/100</div>
        </div>
        <div class="comparison-diff ${scoreDiff >= 0 ? 'diff-positive' : 'diff-negative'}">
          ${scoreDiff >= 0 ? '+' : ''}${scoreDiff}
        </div>
      </div>
    `;

    // Per-criterion comparison
    html += '<div class="comparison-criteria">';
    for (const k of keys) {
      const o = original.criteria[k];
      const r = revised.criteria[k];
      if (!o || !r) continue;
      const diff = r.score - o.score;
      const diffClass = diff > 0 ? 'diff-positive' : (diff < 0 ? 'diff-negative' : 'diff-neutral');
      const diffSign = diff > 0 ? '+' : '';
      const oPct = Math.round((o.score / o.max) * 100);
      const rPct = Math.round((r.score / r.max) * 100);

      html += `
        <div class="comparison-criterion">
          <div class="comparison-criterion-label">${r.label}</div>
          <div class="comparison-criterion-bars">
            <div class="comparison-bar-row">
              <span class="comparison-bar-tag">Orig</span>
              <div class="comparison-bar"><div class="comparison-bar-fill comparison-bar-orig" style="width:${oPct}%"></div></div>
              <span class="comparison-bar-score">${o.score}/${o.max}</span>
            </div>
            <div class="comparison-bar-row">
              <span class="comparison-bar-tag">New</span>
              <div class="comparison-bar"><div class="comparison-bar-fill comparison-bar-new" style="width:${rPct}%"></div></div>
              <span class="comparison-bar-score">${r.score}/${r.max}</span>
            </div>
          </div>
          <div class="comparison-criterion-diff ${diffClass}">${diffSign}${diff}</div>
        </div>
      `;
    }
    html += '</div>';

    // What improved / what regressed
    if (improvements.length > 0 || regressions.length > 0) {
      html += '<div class="comparison-changes">';
      if (improvements.length > 0) {
        html += '<div class="comparison-improved"><strong>Improved:</strong> ' + improvements.join(', ') + '</div>';
      }
      if (regressions.length > 0) {
        html += '<div class="comparison-regressed"><strong>Lower:</strong> ' + regressions.join(', ') + '</div>';
      }
      html += '</div>';
    }

    // Revised answer feedback
    const isAI = revised.evaluatorType === 'gemini';
    const evaluatorBadge = isAI
      ? '<span class="evaluator-badge evaluator-badge-ai">AI (Gemini)</span>'
      : '<span class="evaluator-badge evaluator-badge-heuristic">Heuristic</span>';
    html += `
      <div class="comparison-revised-feedback">
        <h4>Revised Answer Feedback ${evaluatorBadge}</h4>
        <div class="practice-tip">
          <strong>Top tip for further improvement:</strong> ${this.escapeHtml(revised.improvementTip)}
        </div>
        <div class="star-evaluator-note">${this.escapeHtml(revised.evaluatorNote)}</div>
      </div>
    `;

    // Disclaimer
    const disclaimerText = revised.evaluatorType === 'gemini'
      ? '<strong>Note:</strong> A higher score on the revised answer means the AI found stronger STAR elements in your rewritten answer. This does NOT guarantee real interview success — always seek feedback from real interviewers and mentors for a complete assessment.'
      : '<strong>Note:</strong> A higher score on the revised answer means your answer now contains more detectable STAR elements and relevant detail. This does NOT guarantee real interview success — the evaluator uses heuristic pattern matching, not AI. Always seek feedback from real interviewers and mentors for a complete assessment.';
    html += `
      <div class="comparison-disclaimer">
        ${disclaimerText}
      </div>
    `;

    container.innerHTML = html;
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

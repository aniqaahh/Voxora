// ============================================================
// Voxora Feedback Report — STAR-Based
// ============================================================
// Renders feedback from actual evaluation results. Evaluations
// may come from the Google Gemini AI (when GEMINI_API_KEY is set)
// or from the heuristic pattern-matching evaluator (fallback).
// Each evaluation carries an "evaluatorType" field ('gemini' or
// 'heuristic') that determines the badge shown to the user.
//
// Answer quality (STAR) is kept completely separate from delivery
// feedback (clarity, tone). Voxora does NOT infer honesty,
// personality, or competence from any visual or audio data.
// ============================================================

const Feedback = {

  // Flag: when true, indicates the feedback view is showing a
  // historical session (loaded from History.viewSession). The
  // action buttons are customized by History.viewSession() and
  // reset by History.resetFeedbackView() on navigation away.
  fromHistory: false,

  render(answers, evaluations, jdText) {
    // Store for practice view access
    this.answers = answers || [];
    this.evaluations = evaluations || [];
    this.jdText = (jdText !== undefined) ? jdText : (App.state.jdText || '');

    // Generate the aggregated report
    const report = StarEvaluator.aggregateReport(this.evaluations, this.answers, this.jdText);
    this.report = report;

    // Animate overall score
    this.animateScore(report.overallScore);

    // Render STAR criterion breakdown (replaces old categories)
    setTimeout(() => {
      this.renderStarBreakdown(report.criteriaAverages);
    }, 300);

    // Render provisional label if needed
    this.renderProvisionalLabel(report);

    // Render answered count
    const countEl = document.getElementById('answers-count');
    if (countEl) countEl.textContent = report.answeredCount;

    // Render strengths
    this.renderList('strengths-list', report.strengths, 'strength');

    // Render weaknesses
    this.renderList('weaknesses-list', report.weaknesses, 'weakness');

    // Render improvement actions
    this.renderImprovementActions(report.improvementActions);

    // Render JD competencies
    this.renderJDCompetencies(report.jdCompetencies);

    // Render suggested practice questions
    this.renderPracticeQuestions(report.practiceQuestions);

    // Render per-question breakdown with STAR scores
    this.renderAnswersBreakdown();

    // Render delivery note (separate from STAR quality)
    this.renderDeliveryNote();
  },

  // ===== Animate overall score ring =====
  animateScore(target) {
    const scoreEl = document.getElementById('score-num');
    const ring = document.getElementById('score-ring-progress');
    if (!scoreEl) return;
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (circumference * target / 100);

    let current = 0;
    const duration = 1000;
    const steps = 40;
    const increment = target / steps;
    const interval = duration / steps;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      scoreEl.textContent = Math.round(current);
    }, interval);

    if (ring) {
      setTimeout(() => {
        ring.style.transition = 'stroke-dashoffset 1.2s ease';
        ring.style.strokeDashoffset = offset;
      }, 100);
    }
  },

  // ===== Render STAR breakdown bars =====
  renderStarBreakdown(criteriaAverages) {
    const container = document.getElementById('score-breakdown');
    if (!container) return;

    const keys = ['situation', 'task', 'action', 'result', 'relevance'];
    container.innerHTML = keys.map(key => {
      const c = criteriaAverages[key];
      if (!c) return '';
      const pct = Math.round((c.score / c.max) * 100);
      return `
        <div class="breakdown-row">
          <span class="breakdown-label">${c.label}<span class="breakdown-max"> /${c.max}</span></span>
          <div class="breakdown-bar"><div class="breakdown-fill" style="width:${pct}%"></div></div>
          <span class="breakdown-val">${c.score}</span>
        </div>
      `;
    }).join('');
  },

  // ===== Render provisional label =====
  renderProvisionalLabel(report) {
    const label = document.getElementById('feedback-provisional-label');
    if (!label) return;

    if (report.provisional) {
      label.style.display = 'inline-block';
      label.textContent = 'Provisional — some scores are based on limited evidence';
    } else {
      label.style.display = 'none';
    }
  },

  // ===== Render a list (strengths or weaknesses) =====
  renderList(elementId, items, type) {
    const el = document.getElementById(elementId);
    if (!el) return;

    if (!items || items.length === 0) {
      el.innerHTML = '<li style="color:var(--text-mute);">No items identified.</li>';
      return;
    }

    el.innerHTML = items.map(item => `<li>${this.escapeHtml(item)}</li>`).join('');
  },

  // ===== Render improvement actions =====
  renderImprovementActions(actions) {
    const el = document.getElementById('improvement-actions-list');
    if (!el) return;

    if (!actions || actions.length === 0) {
      el.innerHTML = '<p style="color:var(--text-mute);">No specific actions identified.</p>';
      return;
    }

    el.innerHTML = actions.map(a => `
      <div class="action-card">
        <div class="action-priority">${a.priority}</div>
        <div class="action-content">
          <div class="action-criterion">${this.escapeHtml(a.criterion)}</div>
          <p>${this.escapeHtml(a.action)}</p>
        </div>
      </div>
    `).join('');
  },

  // ===== Render JD competencies =====
  renderJDCompetencies(jdComps) {
    const container = document.getElementById('jd-competencies');
    if (!container) return;

    if (!jdComps || !jdComps.available) {
      container.innerHTML = '<p style="color:var(--text-mute);font-size:14px;">No job description was provided — competency analysis is not available.</p>';
      return;
    }

    let html = '<div class="competency-sections">';

    // Demonstrated
    if (jdComps.demonstrated.length > 0) {
      html += '<div class="competency-section competency-demonstrated">';
      html += '<h4>Evidenced in your answers</h4>';
      html += '<div class="competency-tags">';
      jdComps.demonstrated.forEach(c => {
        html += `<span class="comp-tag comp-tag-yes">${this.escapeHtml(c)}</span>`;
      });
      html += '</div></div>';
    } else {
      html += '<div class="competency-section competency-demonstrated">';
      html += '<h4>Evidenced in your answers</h4>';
      html += '<p style="color:var(--text-mute);font-size:14px;">No JD competencies were clearly evidenced.</p>';
      html += '</div>';
    }

    // Not evidenced
    if (jdComps.notEvidenced.length > 0) {
      html += '<div class="competency-section competency-missing">';
      html += '<h4>Not sufficiently evidenced</h4>';
      html += '<div class="competency-tags">';
      jdComps.notEvidenced.forEach(c => {
        html += `<span class="comp-tag comp-tag-no">${this.escapeHtml(c)}</span>`;
      });
      html += '</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
  },

  // ===== Render suggested practice questions =====
  renderPracticeQuestions(questions) {
    const el = document.getElementById('practice-questions-list');
    if (!el) return;

    if (!questions || questions.length === 0) {
      el.innerHTML = '<li style="color:var(--text-mute);">No specific practice questions suggested.</li>';
      return;
    }

    el.innerHTML = questions.map((q, i) => `
      <li>
        <span class="practice-q-num">${i + 1}</span>
        <span>${this.escapeHtml(q)}</span>
      </li>
    `).join('');
  },

  // ===== Render per-question breakdown with STAR scores =====
  renderAnswersBreakdown() {
    const container = document.getElementById('answers-breakdown');
    if (!container) return;

    container.innerHTML = '';

    for (let i = 0; i < this.answers.length; i++) {
      const ans = this.answers[i];
      const evalResult = this.evaluations[i];
      if (!ans) continue;

      const q = MOCK_QUESTIONS.find(mq => mq.id === ans.questionId) || { text: ans.questionText };
      const isSkipped = ans.answer === '[Skipped]';
      const answerText = isSkipped
        ? '<em>Skipped</em>'
        : this.escapeHtml(ans.answer);
      const score = evalResult ? evalResult.totalScore : 0;

      // Evaluator type badge
      let evalBadge = '';
      if (evalResult && !isSkipped) {
        const isAI = evalResult.evaluatorType === 'gemini';
        evalBadge = isAI
          ? '<span class="evaluator-badge evaluator-badge-ai">AI (Gemini)</span>'
          : '<span class="evaluator-badge evaluator-badge-heuristic">Heuristic</span>';
      }

      // STAR mini-breakdown for this answer
      let starMini = '';
      if (evalResult && !isSkipped) {
        const keys = ['situation', 'task', 'action', 'result', 'relevance'];
        starMini = '<div class="answer-star-mini">';
        starMini += keys.map(k => {
          const c = evalResult.criteria[k];
          if (!c) return '';
          const pct = Math.round((c.score / c.max) * 100);
          return `<div class="star-mini-item"><span class="star-mini-label">${c.label[0]}</span><div class="star-mini-bar"><div class="star-mini-fill" style="width:${pct}%"></div></div><span class="star-mini-score">${c.score}/${c.max}</span></div>`;
        }).join('');
        starMini += '</div>';
      }

      // Practice button for non-skipped answers
      let practiceBtn = '';
      if (!isSkipped) {
        practiceBtn = `<button class="btn btn-ghost btn-sm btn-practice" onclick="Practice.start(${i})">Practice this answer</button>`;
      }

      container.innerHTML += `
        <div class="answer-item ${isSkipped ? 'answer-item-skipped' : ''}">
          <div class="answer-item-q">
            <span class="answer-item-q-num">Q${i + 1}.</span>
            <span>${this.escapeHtml(q.text)}</span>
          </div>
          <div class="answer-item-a">${answerText}</div>
          <div class="answer-item-score">
            <span>STAR Score: <strong>${score}</strong>/100 ${evalBadge}</span>
            <div class="answer-item-score-bar">
              <div class="answer-item-score-fill" style="width:${score}%"></div>
            </div>
          </div>
          ${starMini}
          ${isSkipped ? '<p style="font-size:13px;color:var(--text-mute);margin-top:8px;">No answer submitted — score is 0.</p>' : ''}
          ${practiceBtn}
        </div>
      `;
    }
  },

  // ===== Render delivery note (separate from STAR quality) =====
  renderDeliveryNote() {
    const el = document.getElementById('delivery-note');
    if (!el) return;

    el.innerHTML = `
      <div class="delivery-section">
        <h4>Delivery &amp; Presentation (separate from answer quality)</h4>
        <p style="font-size:14px;color:var(--text-dim);margin-bottom:12px;">
          STAR scores above evaluate the <strong>content</strong> of your answers — what you said and how it was structured.
          Delivery factors (clarity, pace, tone) are <strong>not scored by this evaluator</strong>.
        </p>
      </div>
    `;
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

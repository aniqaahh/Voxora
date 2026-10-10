// ============================================================
// Voxora Interview History & Progress Tracking
// ============================================================
// Uses localStorage to persist completed interview sessions.
// Each session stores: date, category, jobRole, questions (as
// answers[]), evaluations[], overall score, and config metadata.
//
// No API keys are ever stored. No audio or video is stored in
// localStorage — only metadata about the interview session.
//
// localStorage is browser-local — data does NOT sync across
// devices. Users can clear all history from the History view.
// ============================================================

const History = {
  STORAGE_KEY: 'voxora_interview_history',
  _clearConfirmTimer: null,

  // Category key -> human-readable label
  CATEGORY_LABELS: {
    general: 'General / HR',
    behavioural: 'Behavioural',
    technical: 'Technical',
    situational: 'Situational',
    internship: 'Internship / Fresh Grad',
    resume: 'Resume-Based'
  },

  // ===== STORAGE LAYER =====

  /**
   * Generate a unique session ID using timestamp + random suffix.
   */
  generateId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  },

  /**
   * Load all sessions from localStorage. Returns [] on error or empty.
   * Handles corrupted/missing data gracefully.
   */
  loadSessions() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        console.warn('[Voxora] History data is not an array, ignoring.');
        return [];
      }
      // Filter out malformed entries (missing required fields)
      return parsed.filter(s => s && typeof s === 'object' && s.id);
    } catch (e) {
      console.warn('[Voxora] Failed to load interview history:', e.message);
      return [];
    }
  },

  /**
   * Persist sessions array to localStorage.
   * Returns true on success, false on failure (e.g. quota exceeded).
   */
  saveSessions(sessions) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(sessions));
      return true;
    } catch (e) {
      console.error('[Voxora] Failed to save interview history:', e);
      if (e.name === 'QuotaExceededError') {
        App.toast('Browser storage limit reached. Try clearing old history.', 'error');
      }
      return false;
    }
  },

  /**
   * Save a completed interview session. Called once from
   * Interview.finishInterview(). Does not create duplicates
   * because finishInterview() is guarded against double-calls.
   *
   * Data saved: id, date, category, jobRole, experienceLevel,
   * questionCount, mode, elapsedTime, jdText, answers,
   * evaluations, overallScore, answeredCount, strengths,
   * weaknesses, improvementActions.
   *
   * NOT saved: API keys, audio, video, resume file contents.
   */
  saveSession(answers, evaluations, report, config) {
    const sessions = this.loadSessions();

    const session = {
      id: this.generateId(),
      date: new Date().toISOString(),
      category: config.category || 'general',
      jobRole: config.jobRole || '',
      experienceLevel: config.experienceLevel || '',
      questionCount: config.questionCount || 0,
      mode: config.mode || 'voice',
      elapsedTime: config.elapsedTime || 0,
      jdText: config.jdText || '',
      answers: answers || [],
      evaluations: evaluations || [],
      // Pre-calculated metrics for quick display
      overallScore: report.overallScore || 0,
      answeredCount: report.answeredCount || 0,
      strengths: report.strengths || [],
      weaknesses: report.weaknesses || [],
      improvementActions: report.improvementActions || []
    };

    sessions.push(session);
    const saved = this.saveSessions(sessions);
    if (saved) {
      console.info('[Voxora] Interview session saved to history:', session.id);
    }
    return session.id;
  },

  /**
   * Retrieve a single session by ID. Returns null if not found.
   */
  getSession(id) {
    const sessions = this.loadSessions();
    return sessions.find(s => s.id === id) || null;
  },

  /**
   * Delete a single session by ID.
   */
  deleteSession(id) {
    let sessions = this.loadSessions();
    sessions = sessions.filter(s => s.id !== id);
    this.saveSessions(sessions);
  },

  /**
   * Update metadata fields on an existing session.
   * Merges the provided fields into the session object.
   */
  updateSessionMeta(sessionId, meta) {
    if (!sessionId || !meta) return false;
    const sessions = this.loadSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return false;
    Object.assign(session, meta);
    this.saveSessions(sessions);
    return true;
  },

  /**
   * Clear all history. Used by the "Clear All History" button.
   */
  clearAllHistory() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (e) {
      console.error('[Voxora] Failed to clear history:', e);
    }
  },

  /**
   * Get sessions that have usable scores (valid, completed sessions).
   * A session is valid if it has evaluations with numeric totalScore
   * and a numeric overallScore.
   */
  getValidSessions() {
    const sessions = this.loadSessions();
    return sessions.filter(s =>
      s &&
      Array.isArray(s.evaluations) &&
      s.evaluations.some(e => e && typeof e.totalScore === 'number') &&
      typeof s.overallScore === 'number'
    );
  },

  // ===== HISTORY VIEW =====

  /**
   * Render the History view: list of completed interview sessions.
   */
  renderHistory() {
    const container = document.getElementById('history-list');
    if (!container) return;

    const sessions = this.loadSessions();

    // Sort newest first
    sessions.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sessions.length === 0) {
      container.innerHTML = this.renderEmptyHistory();
      this.bindEmptyHistoryActions();
      return;
    }

    let html = `
      <div class="history-storage-notice">
        <strong>Note:</strong> Interview history is stored locally in your browser and does not sync across devices. Clearing your browser data will remove all saved sessions.
      </div>
      <div class="history-cards">
    `;

    for (const session of sessions) {
      html += this.renderSessionCard(session);
    }

    html += `
      </div>
      <div class="history-footer">
        <button class="btn btn-danger" id="clear-history-btn">Clear All History</button>
      </div>
      <p class="history-storage-notice history-storage-notice-sm">
        No API keys are ever stored. Your typed/transcribed answers and STAR evaluation results are saved locally in your browser.
      </p>
    `;

    container.innerHTML = html;
    this.bindHistoryActions(sessions);
  },

  /**
   * Render a single session card for the history list.
   */
  renderSessionCard(session) {
    const date = this.formatDate(session.date);
    const categoryLabel = this.CATEGORY_LABELS[session.category] || session.category || 'Unknown';
    const score = typeof session.overallScore === 'number' ? session.overallScore : 0;
    const scoreClass = score >= 70 ? 'score-good' : (score >= 40 ? 'score-mid' : 'score-low');
    const answered = typeof session.answeredCount === 'number' ? session.answeredCount : 0;
    const total = typeof session.questionCount === 'number' ? session.questionCount : 0;
    const role = session.jobRole ? this.escapeHtml(session.jobRole) : '';
    const duration = session.elapsedTime ? this.formatDuration(session.elapsedTime) : '';

    return `
      <div class="history-card" data-session-id="${this.escapeHtml(session.id)}">
        <div class="history-card-main">
          <div class="history-card-date">${this.escapeHtml(date)}</div>
          <div class="history-card-meta">
            <span class="history-badge">${this.escapeHtml(categoryLabel)}</span>
            ${this.renderModeBadge(session.mode)}
            ${role ? `<span class="history-meta-item">Role: ${role}</span>` : ''}
            ${duration ? `<span class="history-meta-item">Duration: ${duration}</span>` : ''}
            <span class="history-meta-item">Questions: ${answered}/${total}</span>
          </div>
        </div>
        <div class="history-card-score ${scoreClass}">
          <span class="history-score-num">${score}</span>
          <span class="history-score-max">/100</span>
        </div>
        <div class="history-card-actions">
          <button class="btn btn-ghost btn-sm history-view-btn" data-session-id="${this.escapeHtml(session.id)}">View Details</button>
          <button class="btn btn-ghost btn-sm history-delete-btn" data-session-id="${this.escapeHtml(session.id)}" title="Delete this session">&times;</button>
        </div>
      </div>
    `;
  },

  /**
   * Render the mode badge for a session card.
   * Returns HTML for a mic-only badge.
   */
  renderModeBadge(mode) {
    if (mode === 'voice') {
      return '<span class="history-mode-badge history-mode-voice">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none">' +
        '<rect x="9" y="2" width="6" height="12" rx="3" stroke="currentColor" stroke-width="2"/>' +
        '<path d="M5 10v2a7 7 0 0 0 14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '<line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
        '</svg> Mic Only</span>';
    } else {
      return '<span class="history-mode-badge history-mode-unknown">Mode unavailable</span>';
    }
  },

  /**
   * Render the empty state for the History view.
   */
  renderEmptyHistory() {
    return `
      <div class="history-empty">
        <div class="history-empty-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <rect x="8" y="12" width="48" height="44" rx="6" stroke="currentColor" stroke-width="2"/>
            <line x1="16" y1="24" x2="40" y2="24" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="16" y1="32" x2="48" y2="32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <line x1="16" y1="40" x2="36" y2="40" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </div>
        <h3>No interviews yet</h3>
        <p>Complete your first mock interview to start building your history. Your sessions, scores, and STAR feedback will appear here for review.</p>
        <button class="btn btn-primary btn-lg" data-view="setup">Start Your First Interview</button>
      </div>
    `;
  },

  /**
   * Bind action buttons in the empty history state.
   */
  bindEmptyHistoryActions() {
    const btn = document.querySelector('#history-list [data-view="setup"]');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        App.navigate('setup');
      });
    }
  },

  /**
   * Bind click handlers for history view buttons (view, delete, clear).
   */
  bindHistoryActions(sessions) {
    // View Details buttons
    document.querySelectorAll('.history-view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-session-id');
        this.viewSession(id);
      });
    });

    // Delete buttons
    document.querySelectorAll('.history-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-session-id');
        const card = btn.closest('.history-card');
        if (card) {
          card.style.opacity = '0.4';
          card.style.pointerEvents = 'none';
        }
        this.deleteSession(id);
        App.toast('Session deleted from history.', '');
        this.renderHistory();
      });
    });

    // Clear All button (two-step confirmation)
    const clearBtn = document.getElementById('clear-history-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (clearBtn.dataset.confirming === 'true') {
          // Second click - confirm
          clearTimeout(this._clearConfirmTimer);
          this.clearAllHistory();
          App.toast('All interview history cleared.', 'success');
          this.renderHistory();
        } else {
          // First click - ask for confirmation
          clearBtn.dataset.confirming = 'true';
          clearBtn.textContent = 'Click again to confirm';
          clearBtn.classList.add('btn-danger-confirm');
          clearTimeout(this._clearConfirmTimer);
          this._clearConfirmTimer = setTimeout(() => {
            if (clearBtn) {
              clearBtn.dataset.confirming = 'false';
              clearBtn.textContent = 'Clear All History';
              clearBtn.classList.remove('btn-danger-confirm');
            }
          }, 4000);
        }
      });
    }
  },

  // ===== PROGRESS VIEW =====

  /**
   * Render the Progress dashboard with metrics and trends.
   */
  renderProgress() {
    const container = document.getElementById('progress-dashboard');
    if (!container) return;

    const validSessions = this.getValidSessions();

    // Sort chronologically (oldest first for trend)
    validSessions.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (validSessions.length === 0) {
      container.innerHTML = this.renderEmptyProgress();
      const btn = container.querySelector('[data-view="setup"]');
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          App.navigate('setup');
        });
      }
      return;
    }

    // Calculate metrics
    const total = validSessions.length;
    const scores = validSessions.map(s => s.overallScore);
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const mostRecent = scores[scores.length - 1];
    const firstScore = scores[0];
    const trendDelta = mostRecent - firstScore;

    // Aggregate recurring strengths and weaknesses
    const recurringStrengths = this.aggregateRecurring(validSessions, 'strengths');
    const recurringWeaknesses = this.aggregateRecurring(validSessions, 'weaknesses');

    // Build HTML
    let html = `
      <div class="history-storage-notice">
        <strong>Note:</strong> Progress data is derived from sessions saved in your browser. It does not sync across devices.
      </div>

      <div class="progress-stats-grid">
        <div class="progress-stat-card">
          <div class="progress-stat-num">${total}</div>
          <div class="progress-stat-label">Total Interviews</div>
        </div>
        <div class="progress-stat-card">
          <div class="progress-stat-num progress-stat-avg">${avg}</div>
          <div class="progress-stat-label">Average Score</div>
          <div class="progress-stat-sub">/100</div>
        </div>
        <div class="progress-stat-card">
          <div class="progress-stat-num progress-stat-recent">${mostRecent}</div>
          <div class="progress-stat-label">Most Recent Score</div>
          <div class="progress-stat-sub">/100</div>
        </div>
      </div>
    `;

    // Score trend chart (only if 2+ sessions)
    if (validSessions.length >= 2) {
      html += this.renderScoreTrend(validSessions, scores);
    } else {
      html += `
        <div class="progress-trend-empty">
          <p>Complete at least 2 interviews to see your score trend over time.</p>
        </div>
      `;
    }

    // Recurring strengths and weaknesses
    html += '<div class="progress-themes-grid">';
    html += this.renderRecurringStrengths(recurringStrengths);
    html += this.renderRecurringWeaknesses(recurringWeaknesses);
    html += '</div>';

    // Per-criterion averages across all sessions
    html += this.renderCriteriaAverages(validSessions);

    // Storage note
    html += `
      <p class="history-storage-notice history-storage-notice-sm">
        Metrics are calculated only from valid, completed sessions with usable scores. No scores or feedback are invented.
      </p>
    `;

    container.innerHTML = html;
  },

  /**
   * Render the score trend as an inline SVG chart.
   */
  renderScoreTrend(sessions, scores) {
    const chartW = Math.max(sessions.length * 80, 300);
    const chartH = 160;
    const padL = 30;
    const padR = 20;
    const padT = 20;
    const padB = 30;
    const plotW = chartW - padL - padR;
    const plotH = chartH - padT - padB;

    // Calculate points
    const points = scores.map((score, i) => {
      const x = padL + (sessions.length === 1 ? plotW / 2 : (i / (scores.length - 1)) * plotW);
      const y = padT + plotH - (score / 100) * plotH;
      return { x, y, score, date: sessions[i].date };
    });

    // Polyline points string
    const polylineStr = points.map(p => `${p.x},${p.y}`).join(' ');

    // Build circles and labels
    let circlesHtml = '';
    let labelsHtml = '';
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const isLast = i === points.length - 1;
      const isFirst = i === 0;
      const circleColor = isLast ? '#10b981' : (isFirst ? '#6366f1' : '#8b5cf6');
      circlesHtml += `<circle cx="${p.x}" cy="${p.y}" r="5" fill="${circleColor}" stroke="#0a0b14" stroke-width="2"/>`;
      circlesHtml += `<text x="${p.x}" y="${p.y - 12}" text-anchor="middle" fill="#e8e9f0" font-size="12" font-weight="700">${p.score}</text>`;

      // X-axis date labels (short)
      const d = new Date(p.date);
      const dateStr = (d.getMonth() + 1) + '/' + d.getDate();
      labelsHtml += `<text x="${p.x}" y="${chartH - 8}" text-anchor="middle" fill="#6b6d80" font-size="10">${dateStr}</text>`;
    }

    // Trend indicator
    const delta = scores[scores.length - 1] - scores[0];
    const trendLabel = delta > 0 ? `+${delta} trend` : (delta < 0 ? `${delta} trend` : 'Stable');
    const trendColor = delta > 0 ? '#10b981' : (delta < 0 ? '#ef4444' : '#9ea0b0');

    return `
      <div class="progress-card">
        <h3>Score Trend</h3>
        <div class="progress-trend-badge" style="color:${trendColor};">${trendLabel}</div>
        <div class="progress-trend-chart">
          <svg width="100%" viewBox="0 0 ${chartW} ${chartH}" preserveAspectRatio="xMidYMid meet">
            <!-- Grid lines -->
            <line x1="${padL}" y1="${padT}" x2="${chartW - padR}" y2="${padT}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
            <line x1="${padL}" y1="${padT + plotH / 2}" x2="${chartW - padR}" y2="${padT + plotH / 2}" stroke="rgba(255,255,255,0.04)" stroke-width="1" stroke-dasharray="4,4"/>
            <line x1="${padL}" y1="${padT + plotH}" x2="${chartW - padR}" y2="${padT + plotH}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
            <!-- Y-axis labels -->
            <text x="${padL - 8}" y="${padT + 4}" text-anchor="end" fill="#6b6d80" font-size="10">100</text>
            <text x="${padL - 8}" y="${padT + plotH / 2 + 4}" text-anchor="end" fill="#6b6d80" font-size="10">50</text>
            <text x="${padL - 8}" y="${padT + plotH + 4}" text-anchor="end" fill="#6b6d80" font-size="10">0</text>
            <!-- Trend line -->
            <polyline points="${polylineStr}" fill="none" stroke="url(#trendGrad)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            <defs>
              <linearGradient id="trendGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#6366f1"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
            <!-- Points and score labels -->
            ${circlesHtml}
            <!-- X-axis date labels -->
            ${labelsHtml}
          </svg>
        </div>
      </div>
    `;
  },

  /**
   * Render recurring strengths section.
   */
  renderRecurringStrengths(strengths) {
    let html = '<div class="progress-card progress-strengths">';
    html += '<h3>Recurring Strengths</h3>';

    if (strengths.length === 0) {
      html += '<p class="progress-no-data">No recurring patterns detected yet.</p>';
    } else {
      html += '<ul class="progress-themes-list">';
      for (const s of strengths.slice(0, 5)) {
        html += `<li>
          <span class="progress-theme-count">${s.count}</span>
          <span>${this.escapeHtml(s.text)}</span>
        </li>`;
      }
      html += '</ul>';
    }

    html += '</div>';
    return html;
  },

  /**
   * Render recurring weaknesses section.
   */
  renderRecurringWeaknesses(weaknesses) {
    let html = '<div class="progress-card progress-weaknesses">';
    html += '<h3>Recurring Weaknesses</h3>';

    if (weaknesses.length === 0) {
      html += '<p class="progress-no-data">No recurring patterns detected yet.</p>';
    } else {
      html += '<ul class="progress-themes-list">';
      for (const w of weaknesses.slice(0, 5)) {
        html += `<li>
          <span class="progress-theme-count progress-theme-count-warn">${w.count}</span>
          <span>${this.escapeHtml(w.text)}</span>
        </li>`;
      }
      html += '</ul>';
    }

    html += '</div>';
    return html;
  },

  /**
   * Render per-criterion average scores across all sessions.
   */
  renderCriteriaAverages(sessions) {
    const criteria = ['situation', 'task', 'action', 'result', 'relevance'];
    const labels = { situation: 'Situation', task: 'Task', action: 'Action', result: 'Result', relevance: 'Relevance' };
    const maxScores = { situation: 15, task: 15, action: 35, result: 25, relevance: 10 };

    // Collect all criterion scores across all sessions and evaluations
    const criterionTotals = {};
    const criterionCounts = {};

    for (const key of criteria) {
      criterionTotals[key] = 0;
      criterionCounts[key] = 0;
    }

    for (const session of sessions) {
      if (!session.evaluations) continue;
      for (const evalResult of session.evaluations) {
        if (!evalResult || !evalResult.criteria) continue;
        for (const key of criteria) {
          const c = evalResult.criteria[key];
          if (c && typeof c.score === 'number') {
            criterionTotals[key] += c.score;
            criterionCounts[key]++;
          }
        }
      }
    }

    let html = '<div class="progress-card">';
    html += '<h3>STAR Criteria Averages (All Sessions)</h3>';
    html += '<div class="progress-criteria-grid">';

    for (const key of criteria) {
      const avg = criterionCounts[key] > 0 ? Math.round(criterionTotals[key] / criterionCounts[key]) : 0;
      const max = maxScores[key];
      const pct = Math.round((avg / max) * 100);
      html += `
        <div class="progress-criterion-row">
          <span class="progress-criterion-label">${labels[key]}</span>
          <div class="progress-criterion-bar"><div class="progress-criterion-fill" style="width:${pct}%"></div></div>
          <span class="progress-criterion-score">${avg}/${max}</span>
        </div>
      `;
    }

    html += '</div></div>';
    return html;
  },

  /**
   * Render the empty state for the Progress view.
   */
  renderEmptyProgress() {
    return `
      <div class="history-empty">
        <div class="history-empty-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
            <path d="M12 48 L24 32 L36 40 L52 16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
            <circle cx="52" cy="16" r="3" fill="currentColor"/>
            <circle cx="24" cy="32" r="3" fill="currentColor"/>
            <circle cx="36" cy="40" r="3" fill="currentColor"/>
          </svg>
        </div>
        <h3>Not enough data yet</h3>
        <p>You need at least one completed interview to see progress metrics. Complete a mock interview to start tracking your STAR scores over time.</p>
        <button class="btn btn-primary btn-lg" data-view="setup">Start an Interview</button>
      </div>
    `;
  },

  /**
   * Aggregate recurring strengths or weaknesses across all sessions.
   * Returns array of { text, count } sorted by count descending.
   * Uses prefix-based grouping (criterion name) to avoid noise from
   * slightly different wording.
   */
  aggregateRecurring(sessions, field) {
    const items = [];

    for (const session of sessions) {
      const arr = session[field];
      if (!Array.isArray(arr)) continue;
      for (const text of arr) {
        if (!text || typeof text !== 'string') continue;

        // Extract the criterion prefix (e.g. "Action:", "Result:")
        // for grouping similar items together
        const prefixMatch = text.match(/^([A-Z][a-z]+):\s*(.+)/);
        if (prefixMatch) {
          const prefix = prefixMatch[1];
          const rest = prefixMatch[2].trim();

          // Try to find an existing item with the same prefix
          let existing = items.find(it => it.prefix === prefix);
          if (!existing) {
            existing = { prefix, text: text, count: 0, examples: [] };
            items.push(existing);
          }
          existing.count++;
          if (existing.examples.length < 1 && rest.length > 10) {
            existing.examples.push(rest);
          }
        } else {
          // No prefix — group by exact match (truncated)
          const truncated = text.substring(0, 60);
          let existing = items.find(it => it.prefix === truncated);
          if (!existing) {
            existing = { prefix: truncated, text: text, count: 0, examples: [] };
            items.push(existing);
          }
          existing.count++;
        }
      }
    }

    // Sort by count descending
    items.sort((a, b) => b.count - a.count);

    // Only return items that appear in more than one session
    return items.filter(it => it.count >= 1).map(it => ({
      text: it.text,
      count: it.count
    }));
  },

  // ===== SESSION DETAIL (View a past session) =====

  /**
   * View a saved session's full details using the existing Feedback
   * rendering components. Sets Feedback.fromHistory = true so the
   * action buttons show "Back to History" instead of the default.
   */
  viewSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      App.toast('Session not found. It may have been deleted.', 'error');
      this.renderHistory();
      return;
    }

    // Mark that we are viewing a historical session
    Feedback.fromHistory = true;

    // Render the feedback using saved data
    // Pass the saved jdText so JD competency analysis works correctly
    Feedback.render(session.answers || [], session.evaluations || [], session.jdText || '');

    // Update feedback header to show it's a historical session
    const header = document.querySelector('#view-feedback .feedback-header h1');
    if (header) {
      header.textContent = 'Session Review';
    }

    const subEl = document.querySelector('#view-feedback .feedback-header .feedback-sub');
    if (subEl) {
      const dateStr = this.formatDate(session.date);
      const categoryLabel = this.CATEGORY_LABELS[session.category] || session.category || 'Unknown';
      const modeLabel = session.mode === 'voice' ? 'Mic Only' : 'Mode unavailable';
      subEl.innerHTML = `<strong>${this.escapeHtml(dateStr)}</strong> &middot; ${this.escapeHtml(categoryLabel)} &middot; ${this.escapeHtml(modeLabel)}` +
        (session.jobRole ? ` &middot; Role: <strong>${this.escapeHtml(session.jobRole)}</strong>` : '') +
        ` &middot; ${session.answeredCount || 0} answers assessed` +
        ` &middot; STAR Score: <strong>${session.overallScore || 0}/100</strong>`;
    }

    // Update action buttons
    const actions = document.querySelector('#view-feedback .feedback-actions');
    if (actions) {
      actions.innerHTML = `
        <button class="btn btn-ghost btn-lg" id="back-to-history-btn">&larr; Back to History</button>
        <button class="btn btn-primary btn-lg" id="history-new-interview-btn">New Interview</button>
      `;
      const backBtn = document.getElementById('back-to-history-btn');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          this.resetFeedbackView();
          App.navigate('history');
        });
      }
      const newBtn = document.getElementById('history-new-interview-btn');
      if (newBtn) {
        newBtn.addEventListener('click', () => {
          this.resetFeedbackView();
          App.navigate('setup');
        });
      }
    }

    App.navigate('feedback');
  },

  /**
   * Reset the feedback view to its default (non-historical) state.
   * Called when navigating away from a historical session view.
   */
  resetFeedbackView() {
    Feedback.fromHistory = false;

    const header = document.querySelector('#view-feedback .feedback-header h1');
    if (header) {
      header.textContent = 'Interview Feedback Report';
    }

    const subEl = document.querySelector('#view-feedback .feedback-header .feedback-sub');
    if (subEl) {
      subEl.innerHTML = `Your answers were scored using the <strong>STAR method</strong>. When Google Gemini AI is configured, answers are evaluated by AI; otherwise, a heuristic pattern-matching evaluator is used. Each answer is labeled accordingly. Scores evaluate answer <em>content</em> only — not tone, accent, or appearance. <strong>Provisional</strong> labels indicate thin evidence.`;
    }

    const actions = document.querySelector('#view-feedback .feedback-actions');
    if (actions) {
      actions.innerHTML = `
        <button class="btn btn-primary btn-lg" data-view="setup">New Interview</button>
        <button class="btn btn-ghost btn-lg" data-view="landing">Back to Home</button>
      `;
      // Bind navigation for new buttons
      actions.querySelectorAll('[data-view]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          App.navigate(el.getAttribute('data-view'));
        });
      });
    }
  },

  // ===== UTILITIES =====

  /**
   * Format an ISO date string for display.
   */
  formatDate(dateStr) {
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Unknown date';
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return 'Unknown date';
    }
  },

  /**
   * Format a duration in seconds for display (e.g. "3m 45s").
   */
  formatDuration(seconds) {
    if (!seconds || seconds < 1) return '';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return s + 's';
    return m + 'm ' + s + 's';
  },

  /**
   * Escape HTML to prevent XSS in dynamically rendered content.
   */
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};

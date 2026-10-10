// ============================================================
// Voxora Feedback & Evaluation Engine
// Generates transparent evaluation reports based on standardized
// interview frameworks (STAR & Core Competencies).
// ============================================================

const Feedback = {
  render(answers, category = 'general') {
    const isBehavioural = category === 'behavioural';
    const rubricDef = (typeof EVALUATION_RUBRICS !== 'undefined' && EVALUATION_RUBRICS[category])
      ? EVALUATION_RUBRICS[category]
      : (typeof EVALUATION_RUBRICS !== 'undefined' && EVALUATION_RUBRICS.default 
          ? EVALUATION_RUBRICS.default 
          : { name: "Standard Rubric" });

    // Evaluate candidate answers using transparent heuristic rubric engine
    const questionEvaluations = answers.map((item, idx) => {
      const text = (item && item.answer && item.answer !== '[Skipped]') ? item.answer : '';
      return this.evaluateAnswer(text, isBehavioural, rubricDef);
    });

    // Compute overall weighted percentage score across all submitted answers
    const totalScoreSum = questionEvaluations.reduce((sum, q) => sum + q.weightedPercentage, 0);
    const overallScore = questionEvaluations.length > 0 
      ? Math.round(totalScoreSum / questionEvaluations.length) 
      : 0;

    // 1. Animate overall score display
    this.animateScore(overallScore);

    // 2. Render Demo Evaluation Warning Badge
    const demoBadge = document.getElementById('demo-evaluation-badge');
    if (demoBadge) {
      demoBadge.innerHTML = `
        <div style="background: rgba(255, 193, 7, 0.15); border: 1px solid #ffc107; color: #ffca28; padding: 10px 14px; border-radius: 8px; font-size: 13px; margin-bottom: 20px;">
          <strong>Notice:</strong> This feedback was generated using Voxora's transparent, rule-based rubric engine (${rubricDef.name}). Connect a live backend AI model for natural language LLM evaluations.
        </div>
      `;
    }

    // 3. Render Strengths & Weaknesses
    const strengthsList = document.getElementById('strengths-list');
    const weaknessesList = document.getElementById('weaknesses-list');

    if (strengthsList) {
      strengthsList.innerHTML = overallScore > 60
        ? `<li>Effective overall structure and direct answers to interview prompts.</li>
           <li>Good communication flow with key details included.</li>`
        : `<li>Attempted answers for all assigned questions.</li>`;
    }

    if (weaknessesList) {
      weaknessesList.innerHTML = isBehavioural
        ? `<li>Ensure all 4 STAR components (Situation, Task, Action, Result) are clearly identifiable.</li>
           <li>Elaborate with specific quantified metrics in the Result section.</li>`
        : `<li>Provide concrete examples to support main arguments.</li>
           <li>Aim for 60-90 seconds of structured spoken response.</li>`;
    }

    // 4. Render Tips
    const tipsList = document.getElementById('tips-list');
    if (tipsList) {
      tipsList.innerHTML = `
        <div class="tip-card">
          <div class="tip-card-tip">Framework Tip</div>
          <p><strong>${isBehavioural ? 'Use the STAR Technique' : 'Be Specific & Direct'}.</strong> ${isBehavioural ? 'Always conclude your story with a concrete Result or key lesson learned.' : 'Start with your main point before elaborating on supporting details.'}</p>
        </div>
      `;
    }

    // 5. Render Detailed Per-Question Transcript & Rubric Breakdown
    const breakdown = document.getElementById('answers-breakdown');
    if (breakdown) {
      breakdown.innerHTML = answers.map((item, idx) => {
        const evalData = questionEvaluations[idx];
        const isSkipped = !item || item.answer === '[Skipped]';
        const displayAnswer = isSkipped 
          ? '<em style="color:#aaa;">[Question Skipped]</em>' 
          : this.escapeHtml(item.answer);

        let starCoverageHtml = '';
        if (isBehavioural && !isSkipped) {
          starCoverageHtml = `
            <div style="display:flex; gap:8px; margin: 12px 0; font-size:12px; flex-wrap:wrap;">
              <span style="padding:4px 10px; border-radius:6px; font-weight:600; background:${evalData.star.situation ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)'}; border:1px solid ${evalData.star.situation ? '#28a745' : '#dc3545'}; color:${evalData.star.situation ? '#2ecc71' : '#e74c3c'};">S: ${evalData.star.situation ? '✓ Context' : '✗ Missing Context'}</span>
              <span style="padding:4px 10px; border-radius:6px; font-weight:600; background:${evalData.star.task ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)'}; border:1px solid ${evalData.star.task ? '#28a745' : '#dc3545'}; color:${evalData.star.task ? '#2ecc71' : '#e74c3c'};">T: ${evalData.star.task ? '✓ Goal' : '✗ Missing Goal'}</span>
              <span style="padding:4px 10px; border-radius:6px; font-weight:600; background:${evalData.star.action ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)'}; border:1px solid ${evalData.star.action ? '#28a745' : '#dc3545'}; color:${evalData.star.action ? '#2ecc71' : '#e74c3c'};">A: ${evalData.star.action ? '✓ Action' : '✗ Missing Action'}</span>
              <span style="padding:4px 10px; border-radius:6px; font-weight:600; background:${evalData.star.result ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)'}; border:1px solid ${evalData.star.result ? '#28a745' : '#dc3545'}; color:${evalData.star.result ? '#2ecc71' : '#e74c3c'};">R: ${evalData.star.result ? '✓ Result' : '✗ Missing Result'}</span>
            </div>
          `;
        }

        return `
          <div class="answer-item" style="border:1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.02); padding:18px; border-radius:10px; margin-bottom:16px;">
            <div class="answer-item-q" style="font-weight:600; font-size:15px; margin-bottom:12px; color:#ffffff;">
              <span class="answer-item-q-num" style="color:#818cf8;">Q${idx + 1}.</span>
              <span>${this.escapeHtml(item ? item.questionText : 'Question')}</span>
            </div>
            
            <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.15); padding: 14px 16px; border-radius: 8px; margin-bottom: 12px; font-size: 14px; line-height: 1.6; color: #e2e8f0;">
              <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">Your Recorded Transcript</div>
              <div>${displayAnswer}</div>
            </div>

            ${starCoverageHtml}

            <div class="answer-item-score" style="margin-top:12px;">
              <span style="font-size:14px; color:#cbd5e1;">Weighted Rubric Match: <strong style="color:#818cf8;">${evalData.weightedPercentage}%</strong></span>
              <div class="answer-item-score-bar" style="background:rgba(255,255,255,0.1); height:8px; border-radius:4px; overflow:hidden; margin-top:6px;">
                <div class="answer-item-score-fill" style="width:${evalData.weightedPercentage}%; background:linear-gradient(90deg, #6366f1, #8b5cf6); height:100%;"></div>
              </div>
            </div>
            
            <p style="font-size:13px; color:#94a3b8; margin-top:10px; line-height:1.4;">
              <strong style="color:#cbd5e1;">Rubric Feedback:</strong> ${evalData.comment}
            </p>
          </div>
        `;
      }).join('');
    }
  },

  /**
   * Transparent Rule-Based Answer Assessor
   */
  evaluateAnswer(answerText, isBehavioural, rubricDef) {
    if (!answerText || answerText === '[Skipped]') {
      return {
        weightedPercentage: 0,
        star: { situation: false, task: false, action: false, result: false },
        comment: "Question was skipped. No evidence provided for rubric assessment."
      };
    }

    const words = answerText.trim().split(/\s+/).filter(w => w.length > 0).length;

    // Detect STAR components via expanded keyword patterns
    const hasSituation = /(when|while|during|at my|in my|years ago|project|past|one time)/i.test(answerText);
    const hasTask = /(needed to|tasked with|goal was|responsible for|had to|assigned|wanted to|make sure)/i.test(answerText);
    const hasAction = /(i created|i built|i led|i implemented|i decided|i developed|i solved|i communicated|i try|i completed|i help|i ask)/i.test(answerText);
    const hasResult = /(as a result|consequently|led to|improved|increased|decreased|learned|managed|finished)/i.test(answerText);

    let calculatedScore = 0;

    if (isBehavioural) {
      // Apply STAR rubric weights: S/T (20%), Action (30%), Result (25%), Relevance (15%), Clarity (10%)
      const stScore = (hasSituation && hasTask) ? 5 : ((hasSituation || hasTask) ? 3 : 2);
      const actionScore = hasAction ? (words > 40 ? 5 : 3) : 2;
      const resultScore = hasResult ? 5 : 2;
      const relevanceScore = words > 25 ? 4 : 2;
      const clarityScore = words > 15 ? 4 : 2;

      calculatedScore = (stScore / 5 * 0.20) +
                        (actionScore / 5 * 0.30) +
                        (resultScore / 5 * 0.25) +
                        (relevanceScore / 5 * 0.15) +
                        (clarityScore / 5 * 0.10);
    } else {
      // Default Competency weights: Relevance (30%), Depth (30%), Clarity (20%), Details (20%)
      const relScore = words > 20 ? 4 : 2;
      const depthScore = words > 35 ? 4 : 3;
      const clarScore = words > 15 ? 4 : 2;
      const detScore = words > 45 ? 5 : 2;

      calculatedScore = (relScore / 5 * 0.30) +
                        (depthScore / 5 * 0.30) +
                        (clarScore / 5 * 0.20) +
                        (detScore / 5 * 0.20);
    }

    const percentage = Math.round(calculatedScore * 100);

    return {
      weightedPercentage: percentage,
      star: { situation: hasSituation, task: hasTask, action: hasAction, result: hasResult },
      comment: words < 30 
        ? "Answer is concise but could benefit from further elaboration and concrete details."
        : "Good detail provided. Meets core structural requirements of the rubric."
    };
  },

  animateScore(target) {
    const scoreEl = document.getElementById('score-num');
    const ring = document.getElementById('score-ring-progress');
    if (!scoreEl) return;

    const circumference = 2 * Math.PI * 70; // ~440
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
        ring.style.transition = 'stroke-dashoffset 1.0s ease';
        ring.style.strokeDashoffset = offset;
      }, 100);
    }
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
};
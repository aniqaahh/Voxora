// ============================================================
// Voxora STAR Answer Evaluator
// ============================================================
// This is a HEURISTIC text analyzer — it serves as the FALLBACK
// evaluator when the Google Gemini API is not available.
//
// When Gemini is configured (GEMINI_API_KEY env var set), the
// interview.js and practice.js modules call the backend
// /api/evaluate endpoint instead, which uses the Gemini AI to
// evaluate answers. If the API key is missing or the call fails,
// this heuristic evaluator is used automatically.
//
// It uses keyword and pattern matching to detect STAR elements
// (Situation, Task, Action, Result) in the candidate's written
// or transcribed answer, then scores each element against a
// transparent rubric.
//
// Limitations:
// - Cannot truly "understand" an answer the way a human or LLM can.
// - Pattern matching may miss well-phrased answers that use
//   different vocabulary, and may over-score answers that use
//   keyword stuffing without real substance.
// - Scores are provisional when evidence is thin or ambiguous.
// - This evaluator does NOT analyze audio quality, tone, accent,
//   facial expressions, or body language. Delivery feedback is
//   kept entirely separate from STAR answer quality.
//
// Rubric (100 points total):
//   Situation:  15 pts  (was context established?)
//   Task:       15 pts  (was the goal/challenge/role described?)
//   Action:     35 pts  (what did the candidate personally do?)
//   Result:     25 pts  (what was the outcome / impact?)
//   Relevance:  10 pts  (does the answer address the question?)
// ============================================================

const StarEvaluator = {

  // ---- Rubric definition ----
  RUBRIC: {
    situation:  { max: 15, label: 'Situation',  desc: 'Was context established? (where, when, who, what was happening)' },
    task:       { max: 15, label: 'Task',        desc: 'Was the goal, challenge, or your responsibility described?' },
    action:     { max: 35, label: 'Action',     desc: 'What did YOU personally do? (specific actions, decisions, contributions)' },
    result:     { max: 25, label: 'Result',     desc: 'What was the outcome, impact, or what did you learn?' },
    relevance:  { max: 10, label: 'Relevance',   desc: 'Does the answer address the question that was asked?' }
  },

  // ---- Pattern libraries ----
  // These detect common phrasing patterns. They are NOT the only way
  // to earn points — the evaluator also checks for sentence structure
  // and content length as secondary signals.

  SITUATION_PATTERNS: [
    /\b(in my|during my|when i was|while i was|at my)\b/i,
    /\b(i was (working|studying|interning|volunteering|participating|enrolled|involved))\b/i,
    /\b(our team|my team|the team|we were|i joined)\b/i,
    /\b(university|college|school|internship|hackathon|volunteer|project|coursework|final year|fyp|capstone)\b/i,
    /\b(last (year|month|semester|summer|week)|recently|a few (months|weeks) ago|during my (first|second|third|final) year)\b/i,
    /\b(in (my|the) (previous|current) (role|position|job|class|module))\b/i
  ],

  TASK_PATTERNS: [
    /\b(the (goal|objective|aim|purpose|challenge|problem|task) (was|is|were))\b/i,
    /\b(i (needed to|had to|was (required|tasked|assigned|responsible) (to|for)))\b/i,
    /\b(we (needed to|had to|were (required|tasked|responsible)))\b/i,
    /\b(my (role|responsibility|task|assignment|job) (was|involved))\b/i,
    /\b(the (problem|issue|challenge) (we faced|was))\b/i,
    /\b(we (aimed to|wanted to|set out to|decided to))\b/i,
    /\b(i was (in charge of|responsible for|tasked with))\b/i
  ],

  ACTION_PATTERNS: [
    /\b(i (built|designed|developed|created|implemented|wrote|coded|programmed|deployed|configured))\b/i,
    /\b(i (led|managed|organized|coordinated|facilitated|directed|headed|drove))\b/i,
    /\b(i (researched|analyzed|investigated|studied|explored|evaluated|assessed|tested))\b/i,
    /\b(i (solved|fixed|resolved|debugged|troubleshot|addressed|overcame))\b/i,
    /\b(i (improved|optimized|refactored|enhanced|streamlined|automated))\b/i,
    /\b(i (presented|demonstrated|explained|communicated|proposed|pitched|advocated))\b/i,
    /\b(i (collaborated|worked with|partnered with|coordinated with))\b/i,
    /\b(i (learned|taught myself|studied|picked up))\b/i,
    /\b(i (decided|chose|selected|prioritized|planned|scheduled))\b/i,
    /\b(i personally|my contribution|i specifically|my role in this)\b/i
  ],

  RESULT_PATTERNS: [
    /\b(as a result|this (led to|resulted in)|the (outcome|result) (was|were))\b/i,
    /\b(we (achieved|delivered|completed|won|launched|shipped|finished))\b/i,
    /\b(i (learned|gained|realized|discovered|took away))\b/i,
    /\b(this (taught me|helped me|allowed me|enabled me))\b/i,
    /\b(\d+\s*(%|percent|users|customers|hours|days|weeks|months|people|members|points|grade|marks))\b/i,
    /\b(grade|score|award|prize|winner|first place|commendation|positive feedback)\b/i,
    /\b(improved by|reduced by|increased by|saved|cut down|decreased)\b/i,
    /\b(successfully|on time|ahead of schedule|within budget|exceeded)\b/i
  ],

  // Words that explicitly label STAR structure — NOT awarded extra points
  STAR_LABELS: [
    /\b(situation:|task:|action:|result:)\b/i,
    /\b(the situation was|my task was|the action i took|the result was)\b/i
  ],

  // ---- Core evaluation method ----
  evaluate(answerText, questionText, jdText) {
    const text = (answerText || '').trim();
    const q = questionText || '';
    const jd = jdText || '';

    // Handle empty or skipped answers
    if (!text || text === '[Skipped]') {
      return this.buildEmptyEvaluation(q);
    }

    const wordCount = text.split(/\s+/).length;
    const sentences = this.splitSentences(text);
    const lowerText = text.toLowerCase();

    // Check for explicit STAR labels — note them but don't award points
    const usesStarLabels = this.STAR_LABELS.some(p => p.test(text));

    // Evaluate each criterion
    const situation = this.evaluateSituation(text, sentences, lowerText);
    const task = this.evaluateTask(text, sentences, lowerText);
    const action = this.evaluateAction(text, sentences, lowerText);
    const result = this.evaluateResult(text, sentences, lowerText, wordCount);
    const relevance = this.evaluateRelevance(text, lowerText, q, jd);

    // Determine if evidence is thin
    const totalScore = situation.score + task.score + action.score + result.score + relevance.score;
    const isShort = wordCount < 40;
    const isProvisional = isShort || (totalScore < 30 && wordCount < 80);

    // Overall assessment
    const strengths = this.identifyStrengths(situation, task, action, result, relevance);
    const weaknesses = this.identifyWeaknesses(situation, task, action, result, relevance, wordCount);
    const improvementTip = this.getTopImprovementTip(situation, task, action, result, relevance, wordCount);

    return {
      wordCount,
      usesStarLabels,
      isProvisional,
      totalScore,
      evaluatorType: 'heuristic',
      criteria: {
        situation: { ...situation, max: this.RUBRIC.situation.max, label: this.RUBRIC.situation.label, desc: this.RUBRIC.situation.desc },
        task:      { ...task,      max: this.RUBRIC.task.max,      label: this.RUBRIC.task.label,      desc: this.RUBRIC.task.desc },
        action:    { ...action,    max: this.RUBRIC.action.max,    label: this.RUBRIC.action.label,    desc: this.RUBRIC.action.desc },
        result:    { ...result,    max: this.RUBRIC.result.max,    label: this.RUBRIC.result.label,    desc: this.RUBRIC.result.desc },
        relevance: { ...relevance, max: this.RUBRIC.relevance.max, label: this.RUBRIC.relevance.label, desc: this.RUBRIC.relevance.desc }
      },
      strengths,
      weaknesses,
      improvementTip,
      evaluatorNote: this.getEvaluatorNote(isShort, wordCount, usesStarLabels)
    };
  },

  // ---- Sentence splitting ----
  splitSentences(text) {
    // Split on sentence-ending punctuation, keep the text
    const parts = text.split(/(?<=[.!?])\s+/);
    return parts.filter(s => s.trim().length > 0);
  },

  // ---- Extract a quoted snippet around a pattern match ----
  extractEvidence(text, patterns, maxLen) {
    maxLen = maxLen || 120;
    for (const p of patterns) {
      const match = text.match(new RegExp(p.source, p.flags));
      if (match) {
        const idx = match.index;
        // Find sentence boundaries around the match
        let start = text.lastIndexOf('.', idx);
        start = start === -1 ? 0 : start + 1;
        let end = text.indexOf('.', idx + match[0].length);
        end = end === -1 ? text.length : end + 1;
        let snippet = text.substring(start, end).trim();
        if (snippet.length > maxLen) {
          snippet = snippet.substring(0, maxLen).trim() + '...';
        }
        return snippet;
      }
    }
    return null;
  },

  // ---- Situation evaluation (15 pts) ----
  evaluateSituation(text, sentences, lowerText) {
    const matchedPatterns = this.SITUATION_PATTERNS.filter(p => p.test(text));
    const evidence = this.extractEvidence(text, this.SITUATION_PATTERNS);
    const matchCount = matchedPatterns.length;

    let score = 0;
    let explanation = '';
    let missing = '';
    let suggestion = '';

    if (matchCount >= 3) {
      score = 13; // Near full
      explanation = 'Clear context established — the answer describes where, when, and what the situation was.';
    } else if (matchCount === 2) {
      score = 10;
      explanation = 'Some context provided, but could be more specific about the setting or background.';
      missing = 'The situation could be described more fully — consider adding when this happened, who was involved, and what the project or role was.';
    } else if (matchCount === 1) {
      score = 6;
      explanation = 'Minimal context provided — the answer jumps into details without fully establishing the situation.';
      missing = 'The reader does not have enough background. Start by briefly describing the context: what project, course, event, or role this took place in.';
    } else {
      score = 2;
      explanation = 'No clear situation or context established in the answer.';
      missing = 'The answer does not set the scene. Before describing actions, briefly explain the context: where were you, what were you doing, and when?';
    }

    // Bonus for mentioning non-professional but valid experiences
    if (/\b(hackathon|volunteer|coursework|final year|fyp|capstone|university project|student society|club|society)\b/i.test(text)) {
      if (score < 13) score += 1;
      explanation += ' Good use of a non-work experience (student project, hackathon, volunteering) which is perfectly valid.';
    }

    score = Math.min(score, this.RUBRIC.situation.max);
    suggestion = missing || 'Add 1-2 sentences at the start describing the context: the project, course, or event, and your role in it.';

    return { score, evidence, explanation, missing, suggestion };
  },

  // ---- Task evaluation (15 pts) ----
  evaluateTask(text, sentences, lowerText) {
    const matchedPatterns = this.TASK_PATTERNS.filter(p => p.test(text));
    const evidence = this.extractEvidence(text, this.TASK_PATTERNS);
    const matchCount = matchedPatterns.length;

    let score = 0;
    let explanation = '';
    let missing = '';
    let suggestion = '';

    if (matchCount >= 2) {
      score = 13;
      explanation = 'The goal, challenge, or responsibility is clearly described.';
    } else if (matchCount === 1) {
      score = 8;
      explanation = 'The task or goal is mentioned but not clearly defined.';
      missing = 'The challenge or goal could be stated more explicitly. What specifically were you trying to achieve or solve?';
    } else {
      score = 3;
      explanation = 'No clear task, goal, or challenge is identified in the answer.';
      missing = 'The answer does not explain what the goal or challenge was. Clarify what you were trying to accomplish or what problem you needed to solve.';
    }

    score = Math.min(score, this.RUBRIC.task.max);
    suggestion = missing || 'State explicitly what you were trying to achieve or what problem you were solving.';

    return { score, evidence, explanation, missing, suggestion };
  },

  // ---- Action evaluation (35 pts) ----
  evaluateAction(text, sentences, lowerText) {
    const matchedPatterns = this.ACTION_PATTERNS.filter(p => p.test(text));
    const evidence = this.extractEvidence(text, this.ACTION_PATTERNS);
    const matchCount = matchedPatterns.length;

    let score = 0;
    let explanation = '';
    let missing = '';
    let suggestion = '';

    // Action is the heaviest criterion — look for multiple first-person actions
    if (matchCount >= 5) {
      score = 30;
      explanation = 'Strong description of personal actions — multiple specific steps described with first-person verbs.';
    } else if (matchCount >= 3) {
      score = 24;
      explanation = 'Several personal actions described, but some could be more specific about what YOU did vs what the team did.';
      missing = 'Some actions are described, but it is not always clear which steps were your individual contribution versus the team\u2019s.';
    } else if (matchCount >= 1) {
      score = 14;
      explanation = 'Limited description of personal actions — the answer mentions some things you did but lacks detail.';
      missing = 'The answer does not describe enough specific actions you personally took. What exactly did you do step by step?';
    } else {
      score = 5;
      explanation = 'Almost no personal actions described — the answer does not explain what you did.';
      missing = 'The answer does not describe your individual actions. Use first-person verbs (I built, I designed, I solved) to explain what you specifically did.';
    }

    // Check for individual vs team contribution clarity
    const hasWe = /\bwe\s+(built|designed|developed|created|decided|implemented|solved|worked)\b/i.test(text);
    const hasIPersonal = /\bi\s+(personally|specifically|myself)\b/i.test(text);
    if (hasWe && !hasIPersonal && matchCount < 5) {
      if (score > 5) score -= 3;
      missing = (missing ? missing + ' ' : '') + 'The answer uses "we" frequently without clarifying your personal contribution. Interviewers want to know what YOU did, not just what the team did.';
    }

    // Reward technical specificity
    if (/\b(api|database|react|node|python|javascript|frontend|backend|algorithm|data structure|git|docker|aws|framework|library|testing|debug)\b/i.test(text)) {
      if (score < 30) score += 2;
      explanation += ' Good technical specificity in describing the work.';
    }

    score = Math.min(score, this.RUBRIC.action.max);
    suggestion = missing || 'Describe 2-3 specific actions you personally took, using "I" statements and naming the tools or techniques you used.';

    return { score, evidence, explanation, missing, suggestion };
  },

  // ---- Result evaluation (25 pts) ----
  evaluateResult(text, sentences, lowerText, wordCount) {
    const matchedPatterns = this.RESULT_PATTERNS.filter(p => p.test(text));
    const evidence = this.extractEvidence(text, this.RESULT_PATTERNS);
    const matchCount = matchedPatterns.length;

    let score = 0;
    let explanation = '';
    let missing = '';
    let suggestion = '';

    // Check for quantifiable outcomes
    const hasNumbers = /\d+\s*(%|percent|users|customers|hours|days|weeks|months|people|members|points|grade|marks|times|x\s)/i.test(text);
    const hasQualitative = /\b(successfully|completed|delivered|launched|won|award|positive feedback|commendation|improved|solved)\b/i.test(text);
    const hasReflection = /\b(i (learned|gained|realized|discovered|took away)|this (taught me|helped me|showed me))\b/i.test(text);

    if (matchCount >= 3 || (hasNumbers && hasQualitative)) {
      score = 21;
      explanation = 'Clear outcome described with specific results or measurable impact.';
    } else if (matchCount >= 2 || (hasQualitative && hasReflection)) {
      score = 15;
      explanation = 'Outcome is described, but lacks specific quantification.';
      missing = 'The result could be made stronger by adding specific numbers or measurable impact (e.g. "reduced load time by 40%", "the project received a distinction grade").';
    } else if (matchCount >= 1 || hasReflection) {
      score = 8;
      explanation = 'A brief outcome or reflection is mentioned, but the result is not clearly stated.';
      missing = 'The answer does not clearly state the outcome. What happened as a result of your actions? Did the project succeed? What did you learn?';
    } else {
      score = 2;
      explanation = 'No clear outcome, result, or reflection described.';
      missing = 'The answer does not describe the result. End with what happened: did the project succeed? What did you learn? Was there any measurable impact?';
    }

    // Reflection is valuable even without quantifiable results
    if (hasReflection && score < 21) {
      score += 2;
      explanation += ' Good self-reflection on what was learned.';
    }

    score = Math.min(score, this.RUBRIC.result.max);
    suggestion = missing || 'Close with the outcome: what was achieved, any measurable impact, and what you learned from the experience.';

    return { score, evidence, explanation, missing, suggestion };
  },

  // ---- Relevance evaluation (10 pts) ----
  evaluateRelevance(text, lowerText, questionText, jdText) {
    const q = questionText || '';
    const qLower = q.toLowerCase();

    // Extract significant words from the question (skip common words)
    const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','can','about','what','your','you','me','my','i','we','our','this','that','these','those','it','its','as','if','then','than','so','not','no','yes','tell','describe','explain','how','why','when','where','who','which']);
    const qWords = qLower.split(/\W+/).filter(w => w.length > 2 && !stopWords.has(w));

    // Check how many question keywords appear in the answer
    let matchCount = 0;
    const matchedWords = [];
    for (const w of qWords) {
      if (lowerText.includes(w)) {
        matchCount++;
        matchedWords.push(w);
      }
    }

    const relevanceRatio = qWords.length > 0 ? matchCount / qWords.length : 0.5;

    let score = 0;
    let explanation = '';
    let missing = '';
    let suggestion = '';

    if (relevanceRatio >= 0.6) {
      score = 9;
      explanation = 'The answer directly addresses the question topic.';
    } else if (relevanceRatio >= 0.3) {
      score = 6;
      explanation = 'The answer is somewhat relevant to the question, but could be more focused.';
      missing = 'The answer touches on the question but does not fully address what was asked.';
    } else if (relevanceRatio >= 0.15) {
      score = 3;
      explanation = 'The answer is only loosely related to the question.';
      missing = 'The answer does not clearly address the question that was asked. Make sure your answer stays on topic.';
    } else {
      score = 1;
      explanation = 'The answer does not appear to address the question.';
      missing = 'The answer does not seem related to the question. Re-read the question and make sure your answer directly responds to it.';
    }

    // Check JD relevance if available
    if (jdText) {
      const jdLower = jdText.toLowerCase();
      const jdKeywords = jdLower.split(/\W+/).filter(w => w.length > 3 && !stopWords.has(w));
      const jdMatched = jdKeywords.filter(w => lowerText.includes(w));
      if (jdMatched.length >= 3) {
        if (score < 10) score += 1;
        explanation += ' The answer references skills or terms from the job description.';
      }
    }

    score = Math.min(score, this.RUBRIC.relevance.max);
    suggestion = missing || 'Ensure your answer directly responds to the question and references relevant skills from the job description.';

    return { score, evidence: matchedWords.length > 0 ? ('Matched question keywords: ' + matchedWords.join(', ')) : null, explanation, missing, suggestion };
  },

  // ---- Build empty/skipped evaluation ----
  buildEmptyEvaluation(questionText) {
    const build = (label, desc) => ({
      score: 0, max: this.RUBRIC[label].max, label: this.RUBRIC[label].label, desc,
      evidence: null,
      explanation: 'No answer was provided for this question.',
      missing: 'No answer was submitted.',
      suggestion: 'Answer this question to receive STAR-based feedback.'
    });

    return {
      wordCount: 0,
      usesStarLabels: false,
      isProvisional: true,
      totalScore: 0,
      evaluatorType: 'heuristic',
      criteria: {
        situation: build('situation', this.RUBRIC.situation.desc),
        task: build('task', this.RUBRIC.task.desc),
        action: build('action', this.RUBRIC.action.desc),
        result: build('result', this.RUBRIC.result.desc),
        relevance: build('relevance', this.RUBRIC.relevance.desc)
      },
      strengths: [],
      weaknesses: ['No answer was provided.'],
      improvementTip: 'Answer this question to receive feedback.',
      evaluatorNote: 'No answer submitted — score is 0 by default.'
    };
  },

  // ---- Identify strengths across criteria ----
  identifyStrengths(s, t, a, r, rel) {
    const strengths = [];
    const criteria = [
      { name: 'Situation',  data: s,   threshold: 10 },
      { name: 'Task',       data: t,   threshold: 10 },
      { name: 'Action',     data: a,   threshold: 22 },
      { name: 'Result',     data: r,   threshold: 16 },
      { name: 'Relevance',  data: rel, threshold: 7 }
    ];

    for (const c of criteria) {
      if (c.data.score >= c.threshold) {
        strengths.push(c.name + ': ' + c.data.explanation);
      }
    }

    if (strengths.length === 0) {
      strengths.push('The candidate attempted the question, which shows willingness to engage.');
    }

    return strengths;
  },

  // ---- Identify weaknesses across criteria ----
  identifyWeaknesses(s, t, a, r, rel, wordCount) {
    const weaknesses = [];
    const criteria = [
      { name: 'Situation',  data: s,   threshold: 8 },
      { name: 'Task',       data: t,   threshold: 8 },
      { name: 'Action',     data: a,   threshold: 18 },
      { name: 'Result',     data: r,   threshold: 13 },
      { name: 'Relevance',  data: rel, threshold: 5 }
    ];

    for (const c of criteria) {
      if (c.data.score < c.threshold && c.data.missing) {
        weaknesses.push(c.name + ': ' + c.data.missing);
      }
    }

    if (wordCount < 40) {
      weaknesses.push('Answer is very short (' + wordCount + ' words) — aim for at least 100-150 words for a behavioral question.');
    }

    if (weaknesses.length === 0) {
      weaknesses.push('No major weaknesses detected by the heuristic evaluator. A human reviewer may find subtler areas for improvement.');
    }

    return weaknesses;
  },

  // ---- Top improvement tip ----
  getTopImprovementTip(s, t, a, r, rel, wordCount) {
    // Find the weakest criterion relative to its max
    const criteria = [
      { name: 'Situation',  data: s,   max: 15 },
      { name: 'Task',       data: t,   max: 15 },
      { name: 'Action',     data: a,   max: 35 },
      { name: 'Result',     data: r,   max: 25 },
      { name: 'Relevance',  data: rel, max: 10 }
    ];

    let weakest = criteria[0];
    for (const c of criteria) {
      if ((c.data.score / c.max) < (weakest.data.score / weakest.max)) {
        weakest = c;
      }
    }

    if (weakest.data.suggestion) {
      return weakest.name + ': ' + weakest.data.suggestion;
    }
    return 'Review the STAR structure of your answer and add more detail to the weakest element.';
  },

  // ---- Evaluator transparency note ----
  getEvaluatorNote(isShort, wordCount, usesStarLabels) {
    let note = 'Scored by heuristic pattern matching (not AI). ';
    if (isShort) {
      note += 'Answer is short (' + wordCount + ' words) — scores may not reflect your full ability. Try writing a more detailed answer (100+ words). ';
    }
    if (usesStarLabels) {
      note += 'Note: explicitly labeling STAR sections does not earn extra points — only the substance of each section is scored. ';
    }
    return note;
  },

  // ---- Determine if a follow-up question is needed ----
  // Works with both heuristic and AI (Gemini) evaluation objects.
  // If the AI already provided a followUp, use that. Otherwise,
  // fall back to score-based detection.
  needsFollowUp(evaluation) {
    if (!evaluation || !evaluation.criteria) return null;

    // If the AI (Gemini) already provided a followUp, use that
    if (evaluation.followUp && evaluation.followUp.element && evaluation.followUp.question) {
      return evaluation.followUp;
    }

    const c = evaluation.criteria;

    // Action is the most important — if very low, ask for personal contribution
    if (c.action.score < 14) {
      return {
        element: 'Action',
        question: 'Could you tell me more about what you personally did in this situation? What specific steps did you take, and what was your individual contribution?'
      };
    }

    // If Result is very low, ask about outcome
    if (c.result.score < 8) {
      return {
        element: 'Result',
        question: 'What was the outcome of this situation? Did the project succeed, and what did you learn from the experience?'
      };
    }

    // If Situation is very low, ask for context
    if (c.situation.score < 5) {
      return {
        element: 'Situation',
        question: 'Could you start by giving a bit more context? What project, course, or event was this, and when did it take place?'
      };
    }

    // If Task is very low, ask about the goal
    if (c.task.score < 5) {
      return {
        element: 'Task',
        question: 'What were you specifically trying to achieve in this situation? What was the goal or challenge?'
      };
    }

    return null; // No follow-up needed
  },

  // ---- Aggregate multiple evaluations into a report ----
  aggregateReport(evaluations, answers, jdText) {
    const valid = evaluations.filter(e => e && e.totalScore !== undefined);
    if (valid.length === 0) {
      return {
        overallScore: 0,
        answeredCount: 0,
        criteriaAverages: {},
        strengths: [],
        weaknesses: [],
        improvementActions: [],
        practiceQuestions: [],
        provisional: true
      };
    }

    const overallScore = Math.round(valid.reduce((sum, e) => sum + e.totalScore, 0) / valid.length);
    const anyProvisional = valid.some(e => e.isProvisional);

    // Average each criterion
    const criteriaAverages = {};
    for (const key of Object.keys(this.RUBRIC)) {
      const scores = valid.map(e => e.criteria[key].score);
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      criteriaAverages[key] = {
        score: avg,
        max: this.RUBRIC[key].max,
        label: this.RUBRIC[key].label,
        desc: this.RUBRIC[key].desc
      };
    }

    // Collect all strengths and weaknesses
    const allStrengths = valid.flatMap(e => e.strengths || []);
    const allWeaknesses = valid.flatMap(e => e.weaknesses || []);

    // Deduplicate and pick top items
    const uniqueStrengths = [...new Set(allStrengths)].slice(0, 5);
    const uniqueWeaknesses = [...new Set(allWeaknesses)].slice(0, 5);

    // Three prioritized improvement actions
    const improvementActions = this.prioritizeActions(valid, criteriaAverages);

    // Suggested practice questions based on weakest areas
    const practiceQuestions = this.suggestPracticeQuestions(criteriaAverages, valid);

    // JD competencies
    const jdCompetencies = this.analyzeJDCompetencies(answers, jdText);

    return {
      overallScore,
      answeredCount: valid.length,
      criteriaAverages,
      strengths: uniqueStrengths,
      weaknesses: uniqueWeaknesses,
      improvementActions,
      practiceQuestions,
      jdCompetencies,
      provisional: anyProvisional
    };
  },

  // ---- Prioritize improvement actions ----
  prioritizeActions(evaluations, criteriaAverages) {
    const actions = [];

    // Sort criteria by lowest score ratio
    const sorted = Object.entries(criteriaAverages).sort((a, b) => {
      return (a[1].score / a[1].max) - (b[1].score / b[1].max);
    });

    const actionMap = {
      situation: 'Start every answer with 1-2 sentences of context: name the project, course, or event, when it happened, and your role.',
      task: 'Clearly state the goal or challenge before describing your actions. What were you trying to achieve or solve?',
      action: 'Use first-person action verbs (I built, I designed, I solved) and describe 2-3 specific steps you personally took. Clarify your individual contribution vs the team\u2019s.',
      result: 'Close every answer with the outcome: what was achieved, any measurable impact (numbers, grades, feedback), and what you learned.',
      relevance: 'Before answering, re-read the question. Make sure your answer directly addresses what was asked and references relevant skills from the job description.'
    };

    for (const [key, data] of sorted.slice(0, 3)) {
      actions.push({
        priority: actions.length + 1,
        criterion: data.label,
        action: actionMap[key] || 'Review and strengthen this area.'
      });
    }

    return actions;
  },

  // ---- Suggest practice questions based on weaknesses ----
  suggestPracticeQuestions(criteriaAverages, evaluations) {
    const questions = [];

    if (criteriaAverages.action.score / criteriaAverages.action.max < 0.6) {
      questions.push('Tell me about a time you had to learn a new technology quickly to complete a project. What specifically did you do?');
      questions.push('Describe a situation where you took initiative to solve a problem that others hadn\u2019t noticed. What steps did you take?');
    }
    if (criteriaAverages.result.score / criteriaAverages.result.max < 0.6) {
      questions.push('Tell me about a project you are proud of. What was the outcome, and how did you measure its success?');
      questions.push('Describe a time something you built or did had a measurable impact. What metrics improved?');
    }
    if (criteriaAverages.situation.score / criteriaAverages.situation.max < 0.6) {
      questions.push('Tell me about a challenging team project during your studies. Set the scene: what was the project, who was involved, and what was your role?');
    }
    if (criteriaAverages.task.score / criteriaAverages.task.max < 0.6) {
      questions.push('Describe a time you faced a difficult technical challenge. What was the specific problem you needed to solve?');
    }
    if (criteriaAverages.relevance.score / criteriaAverages.relevance.max < 0.6) {
      questions.push('Why are you interested in this role? Connect your answer directly to 2-3 requirements from the job description.');
    }

    // Fallback if all criteria are strong
    if (questions.length === 0) {
      questions.push('Tell me about a time you failed at something. What happened, and what did you learn from it?');
      questions.push('Describe a situation where you disagreed with a teammate. How did you handle it?');
      questions.push('Tell me about a time you had to explain a technical concept to a non-technical person.');
    }

    return questions.slice(0, 5);
  },

  // ---- Analyze JD competencies ----
  analyzeJDCompetencies(answers, jdText) {
    if (!jdText || jdText.trim().length < 20) {
      return { available: false, demonstrated: [], notEvidenced: [] };
    }

    // Extract competency keywords from the JD
    const competencyMap = {
      'problem-solving': ['problem', 'solve', 'solution', 'troubleshoot', 'debug'],
      'teamwork': ['team', 'collaborate', 'collaboration', 'cooperate', 'work together'],
      'communication': ['communicate', 'communication', 'present', 'explain', 'write', 'documentation'],
      'leadership': ['lead', 'leader', 'leadership', 'manage', 'direct', 'guide'],
      'technical skills': ['code', 'programming', 'develop', 'build', 'implement', 'technical', 'engineering'],
      'adaptability': ['adapt', 'learn', 'new', 'change', 'flexible', 'agile'],
      'initiative': ['initiative', 'proactive', 'self-start', 'volunteer', 'propose'],
      'analytical thinking': ['analyze', 'analysis', 'data', 'research', 'investigate', 'evaluate'],
      'project management': ['project', 'plan', 'organize', 'schedule', 'deliver', 'deadline'],
      'creativity': ['creative', 'design', 'innovate', 'novel', 'original']
    };

    const jdLower = jdText.toLowerCase();
    const allAnswerText = answers.map(a => (a && a.answer) ? a.answer.toLowerCase() : '').join(' ');

    const demonstrated = [];
    const notEvidenced = [];

    for (const [competency, keywords] of Object.entries(competencyMap)) {
      // Is this competency mentioned in the JD?
      const inJd = keywords.some(kw => jdLower.includes(kw));
      if (!inJd) continue;

      // Is it evidenced in the answers?
      const inAnswers = keywords.some(kw => allAnswerText.includes(kw));
      if (inAnswers) {
        demonstrated.push(competency);
      } else {
        notEvidenced.push(competency);
      }
    }

    return { available: true, demonstrated, notEvidenced };
  }
};

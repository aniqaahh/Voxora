// ============================================================
// Shared Gemini API logic (used by Vercel serverless functions)
// ============================================================
// This module is NOT a standalone serverless function — it is a
// shared library imported by api/health.js and api/evaluate.js.
// The underscore prefix tells Vercel to treat it as a module,
// not an endpoint.
//
// On Vercel, environment variables (GEMINI_API_KEY, GEMINI_MODEL)
// are injected automatically from the Vercel project dashboard.
// There is no .env file loader here — Vercel handles that.
// ============================================================

const https = require('https');

// ============================================================
// Configuration (read from Vercel environment variables)
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_TIMEOUT_MS = 30000;

// ============================================================
// Gemini STAR Evaluation Prompt Builder
// ============================================================
function buildGeminiPrompt(answer, question, jd) {
  const jdContext = jd && jd.trim().length > 10
    ? jd.trim().substring(0, 2000)
    : '(No job description provided)';

  return `You are an expert interview coach evaluating a candidate's answer to a behavioral interview question using the STAR method (Situation, Task, Action, Result).

STAR Rubric (100 points total):
- Situation (15 pts): Was context established? Where, when, who was involved, what was happening?
- Task (15 pts): Was the goal, challenge, or the candidate's responsibility described?
- Action (35 pts): What did the candidate personally do? Specific actions, decisions, and contributions.
- Result (25 pts): What was the outcome, impact, or what did the candidate learn?
- Relevance (10 pts): Does the answer directly address the question asked?

CRITICAL EVALUATION RULES:
1. Score each criterion from 0 to its maximum. Be fair but rigorous.
2. Only cite evidence ACTUALLY present in the candidate's answer. Do NOT invent, assume, or fabricate experience, evidence, or achievements.
3. If an answer is short, vague, or lacks detail, score accordingly (do not give benefit of the doubt).
4. Do NOT analyze tone, accent, appearance, delivery, or body language. Evaluate ONLY the content.
5. If the candidate uses "we" without clarifying their personal contribution, deduct from the Action score.
6. Quantifiable results (numbers, percentages, grades) strengthen the Result score.
7. If the answer is "[Skipped]" or empty, score ALL criteria as 0.

Interview Question: "${question}"

Job Description Context (for relevance assessment):
${jdContext}

Candidate's Answer:
"""
${answer}
"""

Respond with ONLY a JSON object in this exact structure (no markdown, no commentary, just the JSON):
{
  "criteria": {
    "situation": {
      "score": <integer 0-15>,
      "evidence": "<exact quote from the answer that demonstrates this element, or null if none>",
      "explanation": "<1-2 sentences explaining why this score was given>",
      "missing": "<what is missing from this element, or null if nothing missing>",
      "suggestion": "<actionable suggestion to improve this element>"
    },
    "task": {
      "score": <integer 0-15>,
      "evidence": "<quote or null>",
      "explanation": "<1-2 sentences>",
      "missing": "<what's missing or null>",
      "suggestion": "<actionable suggestion>"
    },
    "action": {
      "score": <integer 0-35>,
      "evidence": "<quote or null>",
      "explanation": "<1-2 sentences>",
      "missing": "<what's missing or null>",
      "suggestion": "<actionable suggestion>"
    },
    "result": {
      "score": <integer 0-25>,
      "evidence": "<quote or null>",
      "explanation": "<1-2 sentences>",
      "missing": "<what's missing or null>",
      "suggestion": "<actionable suggestion>"
    },
    "relevance": {
      "score": <integer 0-10>,
      "evidence": "<quote or null>",
      "explanation": "<1-2 sentences>",
      "missing": "<what's missing or null>",
      "suggestion": "<actionable suggestion>"
    }
  },
  "strengths": ["<1-5 specific strengths observed in the answer>"],
  "weaknesses": ["<1-5 specific weaknesses or missing elements>"],
  "improvementTip": "<the single most important improvement the candidate should focus on>",
  "followUp": {
    "element": "<STAR element name that needs clarification, or null if no follow-up needed>",
    "question": "<a specific follow-up question to ask the candidate, or null>"
  },
  "evaluatorNote": "<1-2 sentences noting anything important about this evaluation>"
}`;
}

// ============================================================
// Call the Gemini REST API
// ============================================================
function callGeminiAPI(prompt) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.3,
        maxOutputTokens: 2048
      }
    });

    const options = {
      hostname: GEMINI_HOST,
      path: `/v1beta/models/${GEMINI_MODEL}:generateContent`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          let errMsg = `Gemini API returned HTTP ${res.statusCode}`;
          try {
            const errBody = JSON.parse(body);
            if (errBody.error && errBody.error.message) {
              errMsg += ': ' + errBody.error.message;
            }
          } catch (e) {
            if (body) errMsg += ': ' + body.substring(0, 200);
          }
          reject(new Error(errMsg));
          return;
        }
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (e) {
          reject(new Error('Failed to parse Gemini API response as JSON'));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error('Network error calling Gemini API: ' + e.message));
    });

    req.setTimeout(GEMINI_TIMEOUT_MS, () => {
      req.destroy();
      reject(new Error('Gemini API request timed out after ' + GEMINI_TIMEOUT_MS + 'ms'));
    });

    req.write(requestBody);
    req.end();
  });
}

// ============================================================
// Validate and normalize the Gemini evaluation response
// ============================================================
function validateGeminiEvaluation(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid response: not an object');
  }

  const criteria = raw.criteria;
  if (!criteria || typeof criteria !== 'object') {
    throw new Error('Invalid response: missing criteria object');
  }

  const RUBRIC = {
    situation: { max: 15 },
    task: { max: 15 },
    action: { max: 35 },
    result: { max: 25 },
    relevance: { max: 10 }
  };

  const LABELS = {
    situation: 'Situation',
    task: 'Task',
    action: 'Action',
    result: 'Result',
    relevance: 'Relevance'
  };

  const DESCS = {
    situation: 'Was context established? (where, when, who, what was happening)',
    task: 'Was the goal, challenge, or your responsibility described?',
    action: 'What did YOU personally do? (specific actions, decisions, contributions)',
    result: 'What was the outcome, impact, or what did you learn?',
    relevance: 'Does the answer address the question that was asked?'
  };

  const normalizedCriteria = {};
  let totalScore = 0;

  for (const key of Object.keys(RUBRIC)) {
    const c = criteria[key];
    if (!c || typeof c !== 'object') {
      throw new Error('Missing criterion: ' + key);
    }

    let score = parseInt(c.score, 10);
    if (isNaN(score)) score = 0;
    score = Math.max(0, Math.min(score, RUBRIC[key].max));

    totalScore += score;

    normalizedCriteria[key] = {
      score: score,
      max: RUBRIC[key].max,
      label: LABELS[key],
      desc: DESCS[key],
      evidence: typeof c.evidence === 'string' ? c.evidence : null,
      explanation: typeof c.explanation === 'string' ? c.explanation : '',
      missing: typeof c.missing === 'string' && c.missing.trim() ? c.missing : null,
      suggestion: typeof c.suggestion === 'string' ? c.suggestion : ''
    };
  }

  const isProvisional = totalScore < 30;

  return {
    wordCount: 0,
    usesStarLabels: false,
    isProvisional: isProvisional,
    totalScore: totalScore,
    criteria: normalizedCriteria,
    strengths: Array.isArray(raw.strengths) ? raw.strengths.slice(0, 5) : [],
    weaknesses: Array.isArray(raw.weaknesses) ? raw.weaknesses.slice(0, 5) : [],
    improvementTip: typeof raw.improvementTip === 'string' ? raw.improvementTip : 'Review the STAR structure of your answer.',
    evaluatorNote: typeof raw.evaluatorNote === 'string' ? raw.evaluatorNote : 'Scored by Google Gemini AI.',
    followUp: (raw.followUp && raw.followUp.element && raw.followUp.question)
      ? { element: raw.followUp.element, question: raw.followUp.question }
      : null,
    evaluatorType: 'gemini'
  };
}

// ============================================================
// Extract the text content from Gemini API response
// ============================================================
function extractGeminiText(apiResponse) {
  if (!apiResponse || !apiResponse.candidates || apiResponse.candidates.length === 0) {
    throw new Error('Gemini response has no candidates');
  }

  const candidate = apiResponse.candidates[0];

  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    if (candidate.finishReason === 'SAFETY') {
      throw new Error('Gemini response was blocked by safety filters');
    }
    if (candidate.finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response was truncated (max tokens reached)');
    }
  }

  if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
    throw new Error('Gemini response has no content parts');
  }

  const text = candidate.content.parts[0].text;
  if (!text || typeof text !== 'string') {
    throw new Error('Gemini response text is empty or invalid');
  }

  return text;
}

// ============================================================
// Module exports
// ============================================================
module.exports = {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  buildGeminiPrompt,
  callGeminiAPI,
  validateGeminiEvaluation,
  extractGeminiText
};

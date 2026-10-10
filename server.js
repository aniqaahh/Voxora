const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================================
// .env file loader (no external packages needed)
// ============================================================
// Reads a .env file in the project root (if it exists) and loads
// its KEY=VALUE entries into process.env. This allows you to put
// your GEMINI_API_KEY in a local .env file instead of setting an
// OS environment variable manually.
//
// The .env file is listed in .gitignore and will NEVER be committed.
// ============================================================
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;   // skip blank lines and comments
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) return;
    const key = line.substring(0, eqIdx).trim();
    const val = line.substring(eqIdx + 1).trim();
    // Only set if not already defined in the OS environment
    // (OS env vars take precedence over .env file)
    if (!process.env[key]) {
      process.env[key] = val;
    }
  });
}

const PORT = 3000;
const ROOT = path.join(__dirname);

// ============================================================
// Gemini API Configuration
// ============================================================
// The API key is read from the GEMINI_API_KEY environment variable.
// It is NEVER hardcoded, logged, or exposed to the browser.
// The model defaults to gemini-3.5-flash-lite (Stable, recommended
// by Google for new projects as of Oct 2026) and can be overridden
// via the GEMINI_MODEL environment variable.
//
// Note: gemini-2.0-flash (previous default) has been shut down.
// Note: gemini-3.5-flash does not exist — the 3.5 Flash family
//       only has gemini-3.5-flash-lite.
//
// Other stable text-generation Flash models (Oct 2026):
//   gemini-3.8-flash      — newest, most intelligent Flash model
//   gemini-3.6-flash      — previous-gen Flash, balanced
//   gemini-3.5-flash-lite — fastest, most cost-effective (current default)
// ============================================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GEMINI_HOST = 'generativelanguage.googleapis.com';
const GEMINI_TIMEOUT_MS = 30000; // 30s timeout for Gemini calls

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
};

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
    // Clamp score to valid range
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

  // Determine provisional status
  const wordCount = (arguments[1] || '').split(/\s+/).filter(w => w).length;
  // We don't have wordCount here reliably; set based on total score
  const isProvisional = totalScore < 30;

  return {
    wordCount: 0, // Not available from AI; set by caller if needed
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

  // Check finish reason
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
// POST /api/evaluate — AI-powered STAR evaluation
// ============================================================
async function handleEvaluateRequest(req, res) {
  // Read and parse the request body
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);

      // Validate required fields
      const answer = (payload.answer || '').trim();
      const question = (payload.question || '').trim();
      const jd = (payload.jd || '').trim();

      if (!answer) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: answer' }));
        return;
      }

      if (!question) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required field: question' }));
        return;
      }

      // Check if API key is configured
      if (!GEMINI_API_KEY) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          fallback: true,
          reason: 'no_api_key',
          message: 'GEMINI_API_KEY is not set. Using heuristic evaluation.'
        }));
        return;
      }

      // Build the prompt
      const prompt = buildGeminiPrompt(answer, question, jd);

      // Call Gemini API
      let apiResponse;
      try {
        apiResponse = await callGeminiAPI(prompt);
      } catch (apiErr) {
        console.error('[Voxora] Gemini API call failed:', apiErr.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          fallback: true,
          reason: 'api_error',
          message: 'Gemini API call failed: ' + apiErr.message
        }));
        return;
      }

      // Extract text from the API response
      let responseText;
      try {
        responseText = extractGeminiText(apiResponse);
      } catch (extractErr) {
        console.error('[Voxora] Failed to extract Gemini text:', extractErr.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          fallback: true,
          reason: 'response_parse_error',
          message: extractErr.message
        }));
        return;
      }

      // Parse the JSON response text
      let evaluationRaw;
      try {
        evaluationRaw = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('[Voxora] Gemini response is not valid JSON');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          fallback: true,
          reason: 'invalid_json',
          message: 'Gemini returned non-JSON content despite JSON request.'
        }));
        return;
      }

      // Validate and normalize the evaluation
      let evaluation;
      try {
        evaluation = validateGeminiEvaluation(evaluationRaw);
      } catch (valErr) {
        console.error('[Voxora] Gemini evaluation failed validation:', valErr.message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          fallback: true,
          reason: 'validation_failed',
          message: 'Gemini response failed validation: ' + valErr.message
        }));
        return;
      }

      // Calculate word count from the answer
      evaluation.wordCount = answer.split(/\s+/).filter(w => w).length;

      // Success — return the AI evaluation
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: true,
        evaluation: evaluation,
        model: GEMINI_MODEL
      }));

    } catch (err) {
      console.error('[Voxora] /api/evaluate error:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        fallback: true,
        reason: 'server_error',
        message: 'Internal server error: ' + err.message
      }));
    }
  });
}

// ============================================================
// GET /api/health — Check if Gemini is configured
// ============================================================
function handleHealthCheck(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    geminiConfigured: !!GEMINI_API_KEY,
    model: GEMINI_MODEL,
    message: GEMINI_API_KEY
      ? 'Gemini API key is configured. AI evaluation is available.'
      : 'GEMINI_API_KEY is not set. Evaluations will use heuristic fallback.'
  }));
}

// ============================================================
// Static file server (unchanged from original)
// ============================================================
const server = http.createServer((req, res) => {
  // Handle API routes first
  if (req.method === 'GET' && req.url === '/api/health') {
    handleHealthCheck(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/evaluate') {
    handleEvaluateRequest(req, res);
    return;
  }

  // Static file serving (original logic)
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(ROOT, decodeURIComponent(filePath));

  // Prevent path traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    // Prevent browser from caching JS/CSS during development
    if (ext === '.js' || ext === '.css' || ext === '.html') {
      headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
    }
    res.writeHead(200, headers);
    res.end(data);
  });
});

server.listen(PORT, () => {
  const aiStatus = GEMINI_API_KEY
    ? `Gemini AI evaluation ENABLED (model: ${GEMINI_MODEL})`
    : 'Gemini AI evaluation DISABLED (set GEMINI_API_KEY to enable)';
  console.log(`Voxora prototype running at http://localhost:${PORT}`);
  console.log(`  ${aiStatus}`);
});

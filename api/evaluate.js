// ============================================================
// POST /api/evaluate — Vercel Serverless Function
// ============================================================
// Accepts: { answer: string, question: string, jd?: string }
// Returns: { success: true, evaluation: {...}, model: string }
//    or:   { fallback: true, reason: string, message: string }
//
// The API key is read server-side from Vercel environment
// variables — it is NEVER exposed to the browser.
// ============================================================

const {
  GEMINI_API_KEY,
  GEMINI_MODEL,
  buildGeminiPrompt,
  callGeminiAPI,
  validateGeminiEvaluation,
  extractGeminiText
} = require('./_lib/gemini');

// ============================================================
// Helper: read JSON body from request (Vercel may pre-parse or
// require manual stream reading depending on the runtime)
// ============================================================
function getJsonBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel may pre-parse the body into req.body
    if (req.body && typeof req.body === 'object') {
      resolve(req.body);
      return;
    }
    // Otherwise, read from the stream
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(new Error('Request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ============================================================
// Vercel serverless handler
// ============================================================
module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const payload = await getJsonBody(req);

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
};

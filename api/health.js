// ============================================================
// GET /api/health — Vercel Serverless Function
// ============================================================
// Checks whether the Gemini API key is configured (without
// revealing the secret). The frontend uses this to show
// whether AI evaluation is available.
//
// Vercel reads environment variables from the project's
// Environment Variables (configured in the Vercel dashboard).
// ============================================================

const { GEMINI_API_KEY, GEMINI_MODEL } = require('./_lib/gemini');

module.exports = (req, res) => {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    geminiConfigured: !!GEMINI_API_KEY,
    model: GEMINI_MODEL,
    message: GEMINI_API_KEY
      ? 'Gemini API key is configured. AI evaluation is available.'
      : 'GEMINI_API_KEY is not set. Evaluations will use heuristic fallback.'
  }));
};

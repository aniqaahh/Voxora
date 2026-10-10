# Voxora — Mock Interview Preparation Platform (Prototype)

Your experience. Your next opportunity.

## Quick Start

```bash
node server.js
```

Then open **http://localhost:3000** in your browser (Chrome or Edge recommended for speech recognition support).

## What's Working vs Mocked

### Working Features
| Feature | Status | Technology |
|---|---|---|
| Landing page | Working | HTML/CSS/JS |
| Interview setup (resume upload, JD input, mode selection) | Working | JS + File API |
| PDF resume upload (with validation) | Working | File API |
| Text resume paste fallback | Working | HTML textarea |
| Sample job description loader | Working | JS |
| Interview question display | Working | JS + mock data |
| Voice answer (speech-to-text) | Working* | Web Speech API |
| Text answer fallback | Working | HTML textarea |
| Camera live preview | Working* | getUserMedia API |
| Interview start/end flow | Working | JS |
| Session timer | Working | JS |
| Responsive design | Working | CSS |
| Feedback report (scores, strengths, tips) | Working (mock data) | JS + CSS animations |

*Browser-dependent — requires Chrome or Edge for speech recognition. Camera requires HTTPS or localhost.

### Mocked / Not Yet Implemented
| Feature | Status | Why |
|---|---|---|
| AI-generated interview questions | Mocked | No AI API configured. Uses 5 pre-written questions. |
| AI-generated feedback analysis | Mocked | No AI API configured. Uses pre-written sample feedback. |
| Resume parsing (extracting text from PDF) | Mocked | PDF is accepted and validated, but text isn't extracted. User can paste text as fallback. |
| Job description analysis | Mocked | JD is collected but not analyzed for question generation. |
| Video recording/analysis | Not implemented | By design — camera is for live preview only, no storage. |
| Voice tone analysis | Mocked | No speech analysis service configured. |
| Login / user accounts | Not implemented | By design for prototype. |
| Database / persistence | Not implemented | By design for prototype. |

## Browser API Support

### Speech Recognition (Web Speech API)
- **Supported:** Chrome (desktop & Android), Edge
- **Not supported:** Firefox, Safari (partial)
- **Fallback:** Users can always type answers in the text area

### Camera (getUserMedia)
- **Supported:** All modern browsers (requires HTTPS or localhost)
- **Fallback:** Camera card is hidden in Voice-only mode

### Microphone
- **Permission:** Requested only when user clicks "Start Recording"
- **Fallback:** Text answer area always available

## Interview Modes

1. **Voice Interview** — Microphone + speech-to-text. Type fallback available.
2. **Voice + Camera** — Same as above, plus live camera preview. No video is recorded or stored.

## File Structure

```
voxora/
├── server.js          # Node.js static file server (no dependencies)
├── index.html         # Single-page app with all views
├── css/
│   └── styles.css     # Full styling, responsive, dark theme
├── js/
│   ├── mock-data.js   # 5 mock questions + sample feedback
│   ├── app.js         # Navigation, setup, state management
│   ├── interview.js   # Interview interface (mic, camera, speech)
│   └── feedback.js    # Feedback report rendering
└── README.md          # This file
```

## Technology Stack

- **Runtime:** Node.js 22 (built-in `http` module only — zero npm dependencies)
- **Frontend:** Vanilla HTML/CSS/JS (no framework, no build step)
- **Browser APIs:** Web Speech API, getUserMedia, File API
- **Fonts:** Google Fonts (Inter)

## Running the Prototype

```bash
# From the voxora directory:
node server.js

# Server starts on http://localhost:3000
```

No `npm install` needed — the server uses only Node.js built-in modules.

## Privacy

- No data is sent to any server or API
- No data is stored or persisted
- Camera stream is live-only — never recorded
- Microphone audio is processed locally by the browser's speech API
- All processing happens client-side in the browser

## Next Steps for Full Version

1. Integrate an AI API (OpenAI, Anthropic, etc.) for question generation and feedback analysis
2. Add PDF text extraction (pdf.js) to parse uploaded resumes
3. Implement user accounts and session persistence (database)
4. Add video analysis for body language and facial expressions
5. Support more question types (technical, case study, coding)
6. Add multi-language support for speech recognition

# Deploying Voxora to GitHub Pages

This guide walks you through uploading the Voxora prototype to a GitHub repository and enabling GitHub Pages hosting.

## Prerequisites

- A [GitHub](https://github.com) account
- [Git](https://git-scm.com/downloads) installed on your computer
- The Voxora project files (this folder)

## What's included

| File/Folder | Purpose | Needed for GitHub Pages? |
|---|---|---|
| `index.html` | Main entry point | Yes |
| `css/styles.css` | All styling | Yes |
| `js/mock-data.js` | Mock interview questions + sample feedback | Yes |
| `js/app.js` | Navigation, setup, state management | Yes |
| `js/interview.js` | Mic, camera, speech, timer logic | Yes |
| `js/feedback.js` | Feedback report rendering | Yes |
| `server.js` | Local dev server (Node.js) | No — kept for local dev only |
| `.nojekyll` | Disables Jekyll processing on GitHub Pages | Yes |
| `.gitignore` | Excludes backups, secrets, OS files | Yes |
| `README.md` | Project documentation | Yes |
| `backup_*/` | Local backup before mic fix | No — gitignored |

## Step 1: Initialize a Git repository

Open a terminal **inside the `voxora/` folder** and run:

```bash
git init
git add .
git status
```

Verify that `backup_*/` is **not** listed in the staged files (it's in `.gitignore`).

## Step 2: Create your first commit

```bash
git commit -m "Voxora prototype: mock interview platform"
```

## Step 3: Create a GitHub repository

1. Go to [github.com/new](https://github.com/new)
2. **Repository name**: `voxora` (or any name you prefer)
3. Set visibility to **Public** (required for free GitHub Pages) or **Private** (requires GitHub Pro for Pages)
4. Do **not** add a README, .gitignore, or license — your project already has these
5. Click **Create repository**

## Step 4: Push your code to GitHub

GitHub will show you the push commands. They look like:

```bash
git remote add origin https://github.com/YOUR_USERNAME/voxora.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

## Step 5: Enable GitHub Pages

1. Open your repository on GitHub
2. Go to **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **Deploy from a branch**
4. Select branch: **`main`** — folder: **`/ (root)`**
5. Click **Save**

Wait 1-2 minutes. Your site will be live at:

```
https://YOUR_USERNAME.github.io/voxora/
```

If you named your repository `YOUR_USERNAME.github.io`, the URL will be:

```
https://YOUR_USERNAME.github.io/
```

## Step 6: Verify the deployment

1. Open the GitHub Pages URL in **Chrome** or **Edge** (for speech recognition support)
2. You should see the Voxora landing page
3. Click "Start Practising" → paste resume text + a job description → Start Interview
4. Click "Read Question" — the browser should speak the question (text-to-speech)
5. Click "Start Recording" — Chrome will prompt for microphone permission
6. Speak — your words should appear as text in real time

## Features and Limitations on GitHub Pages

### Works on GitHub Pages
- Landing page, setup page, interview interface, feedback report
- Resume PDF upload (client-side File API)
- Resume text paste + job description input
- Interview mode selection (Voice / Voice+Camera)
- Mock question display (5 pre-written questions)
- Text answer input (always available)
- Text-to-speech (reads questions aloud) — works in all modern browsers
- Camera live preview — works on HTTPS (GitHub Pages is HTTPS by default)
- Feedback report with animated scores
- Fully responsive design

### Requires specific browser
- **Speech recognition** (mic → text): Chrome or Edge only. Firefox/Safari users get the text answer fallback automatically.

### Mic/Camera on GitHub Pages
- GitHub Pages serves over **HTTPS** — this satisfies the secure context requirement for `getUserMedia` (microphone and camera).
- Microphone is requested **only when you click "Start Recording"** — never on page load.
- Camera is requested **only when you click "Enable Camera"** — never on page load.
- No audio or video is recorded or stored. Camera is live preview only.

### Not available (by design)
- No backend server (GitHub Pages is static-only)
- No database (no persistence between sessions)
- No login system
- No AI API calls (questions and feedback are pre-written mock data)
- `server.js` is for local development only — not used on GitHub Pages

## Updating the deployed site

After making changes locally:

```bash
git add .
git commit -m "Description of changes"
git push
```

GitHub Pages automatically rebuilds within 1-2 minutes of pushing to `main`.

## Local development

To run locally with the Node.js server:

```bash
node server.js
```

Then open `http://localhost:3000` in Chrome or Edge.

**Note:** `localhost` is treated as a secure context by browsers, so microphone and camera work locally. If you serve from a non-localhost HTTP address, mic/camera will be blocked by the browser.

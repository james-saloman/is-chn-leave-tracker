# CHN-IS Leave Tracker

A single-page dashboard for tracking team leave, work-from-home (WFH), and skills across the BW Design Group CHN Information Solutions team. Built with vanilla HTML/CSS/JS and backed by Google Sheets — no build step, no dependencies.

## What is this?

The Leave Tracker is a lightweight web app that gives a team lead and its members a real-time, shared view of:

- **Who is on leave** today and in the future
- **Who is working from home** (WFH days are tracked but don't count against leave totals)
- **Team capacity** at a glance — how many professionals are available right now
- **A calendar view** of leave and WFH across the whole team
- **A leave summary** per professional
- **A skill matrix** to see team capabilities at a glance

Anyone on the team can submit a leave request directly from the dashboard (PIN-protected), and the view updates automatically every 30 seconds.

## Why does this app exist? (The problem it solves)

Before this tool, team leave was typically tracked in scattered ways — informal messages, individual calendars, or a spreadsheet only one person opened. That created recurring problems:

| Problem | How the tracker fixes it |
| --- | --- |
| **No single source of truth** — nobody knew who was actually out today. | One shared dashboard pulling from a single Google Sheet, refreshed in real time. |
| **Hard to plan around absences** — surprise gaps in coverage. | Overview + calendar views make upcoming leave and current capacity obvious before it becomes a problem. |
| **WFH vs. actual leave got confused** — WFH days wrongly counted as time off. | WFH is tracked separately and excluded from leave totals. |
| **Submitting leave was manual and inconsistent.** | Built-in, PIN-protected leave form writes straight to the backend. |
| **No visibility into team skills** when staffing work. | A skill matrix view shows team capabilities alongside availability. |

The result: less guesswork, easier resource planning, and one place everyone can trust.

## Who is it for?

- **Team leads / managers** — plan around absences, check daily capacity, review leave history, and reference the skill matrix when staffing.
- **Team members** — submit their own leave/WFH requests and see the team's schedule.

## How it works

```
┌─────────────────┐        doGet / doPost        ┌──────────────────┐
│   Browser app   │  ◄──────────────────────────►│  Google Apps     │
│ (HTML/CSS/JS)   │   JSON over HTTPS            │  Script web app  │
│  GitHub Pages   │                              │  → Google Sheet  │
└─────────────────┘                              └──────────────────┘
```

- The frontend is static HTML/CSS/JS served from **GitHub Pages**.
- A **Google Apps Script** web app acts as the backend: `doGet()` returns all leave records as JSON, `doPost()` accepts a new leave submission.
- All data lives in a single **Google Sheet** — no database to host or maintain.
- The dashboard polls every 30 seconds so it stays current without a refresh.

## Tech stack

- **Frontend:** Vanilla HTML, CSS (custom properties for theming), JavaScript — no framework, no build process
- **Backend:** Google Apps Script + Google Sheets
- **Hosting:** GitHub Pages (auto-deploys on push to `main`)
- **PDF export:** `html2pdf.js` (CDN)

## Key files

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and DOM layout |
| `script.js` | All app logic — data loading, views, state, form submission |
| `styles.css` | All styling (CSS custom properties for theming) |
| `App script` | Google Apps Script backend (`doGet` / `doPost`) |
| `.github/workflows/static.yml` | Auto-deploy to GitHub Pages |
| `CLAUDE.md` / `DEVELOPMENT.md` | Contributor and AI-assistant guidance |

## Running locally

No build is required. Either open `index.html` directly in a browser, or serve the folder to avoid CORS issues:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deployment

Pushing to `main` triggers the GitHub Pages workflow and publishes the site automatically:

```bash
git add .
git commit -m "Your change"
git push origin main
```

## Configuration

The frontend talks to the backend via an `API_URL` constant in `script.js`:

```javascript
const API_URL = "https://script.google.com/macros/s/{YOUR_SCRIPT_ID}/exec";
```

Update this if the Google Apps Script deployment changes.

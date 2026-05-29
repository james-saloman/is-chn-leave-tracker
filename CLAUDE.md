# CLAUDE.md

Guidance for Claude Code working on the IS_CHN Leave Tracker.

## Project

Single-page leave tracking dashboard: vanilla HTML/CSS/JS frontend, Google Sheets backend (via Google Apps Script), deployed to GitHub Pages. No build process—runs directly as static HTML.

**Key files:**

- `index.html` — HTML structure and DOM layout
- `script.js` — All JavaScript logic (data loading, UI interactions, state management)
- `styles.css` — All CSS styling (uses CSS custom properties for theming)
- Google Apps Script — Web app for `doGet()` (fetch leaves) and `doPost(e)` (submit leave)
- `.github/workflows/static.yml` — Auto-deploys to Pages on push to main

## Data & Architecture

**Frontend ↔ Backend:**

- Frontend calls Google Apps Script endpoint via `API_URL`
- `doPost` accepts: `{name, id, from_leave, end_leave, reason, wfh}`
- `doGet` returns JSON array of all leave records
- Frontend polls every 30 seconds (`setInterval(loadSheetData, 30000)`)

**Key state:**

- `MEMBERS` array (loaded dynamically via `loadMembers()` from Google Sheet): `{id, name, role, bg, color}`
- `leaveData` object: leave records keyed by member ID
- `currentView`: tracks active view ("overview", "calendar", or "summary")
- `activeFilter`: tracks active filter state
- Sheet columns: S.No, Name, Member ID, From Date, End Date, Reason, WFH, Timestamp

**UI Layout:**

- Sticky header (search bar) + sticky nav (filter tabs)
- Member card grid (responsive: `repeat(auto-fill, minmax(190px, 1fr))`)
- Right-side drawer: member details + leave history
- Modal overlay: leave form with 4-digit PIN protection
- Toast notifications for feedback

## Important Details

**PIN validation:** 4-digit PIN in hidden inputs `p1`, `p2`, `p3`, `p4`. Validated before form submission.

**WFH logic:** Stored as "Yes"/"No" string in sheet column G. WFH days do NOT count toward leave totals (see `getActualLeaveDays()`). Styled as green badge vs blue badge.

**Date handling:** Single-day = `from_leave === end_leave`. Multi-day = `from_leave` is start, `end_leave` is end. All dates flow to/from Apps Script.

**Search & filter:** Real-time name/ID search. Nav tabs filter which members appear and update badge counts. Active filter tracked by `.active` class.

**CSS variables:** `--primary`, `--accent`, `--success`, `--danger`, `--warn` (status); `--bg`, `--card`, `--border` (layout); `--text`, `--muted`, `--subtle` (text).

## Common Tasks

**Test locally:** No build needed. Open `index.html` directly in browser or run `python3 -m http.server 8000` to serve all files and avoid CORS issues.

**Update Google Apps Script endpoint:** Edit `API_URL` in script.js:
```javascript
const API_URL = "https://script.google.com/macros/s/{YOUR_SCRIPT_ID}/exec";
```

**Add a member:** Members are now loaded dynamically from Google Sheet via `loadMembers()`. To add members, use the "+ Add Professional" button in the UI or add entries directly to the Sheet.

**Add filter tab:** Add nav button calling filter function (e.g., `filterWithLeaves()`, `filterWFH()`).

**Styling:** All CSS in `styles.css`. Uses CSS custom properties (see `:root` for color/layout/text variables).

**Key JS functions (in script.js):**

- Data: `loadMembers()`, `loadSheetData()`, `formatMemberCards()`
- UI: `openModal(id)`, `closeModal()`, `openAddMemberModal()`, `closeAddMemberModal()`, `switchView()`, `submitLeave()`
- Utils: `getDays(from, to)`, `getInitials(name)`, `formatDate(date)`, `getActualLeaveDays()`
- Views: `renderOverviewView()`, `renderCalendarView()`, `renderSummaryView()`

## Deployment

GitHub Pages auto-deploys on push to main (via static.yml). Site served from repo root.

```bash
git add index.html
git commit -m "Fix/feature"
git push origin main
```

## Notes

- No npm, no dependencies, no package.json.
- Member list is hardcoded; consider moving to Sheet/API if dynamic list needed.
- Single Google Sheet for all leaves; partition strategy if data grows.

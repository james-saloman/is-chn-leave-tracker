# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**IS_CHN Leave Tracker** is a leave tracking dashboard for team members. It displays leave status, allows team members to apply for leave, and maintains historical leave records.

- **Frontend:** Single-page vanilla HTML/CSS/JavaScript application (no frameworks)
- **Backend:** Google Sheets with Google Apps Script
- **Deployment:** GitHub Pages (automatic on push to main)
- **No build process required** — runs directly as static HTML

## Key Files

- **index.html** (592 lines) — Complete frontend application
  - Styled header, navigation, member card grid, leave history drawer, leave application modal
  - All JavaScript logic embedded in `<script>` tag
  - Hardcoded `MEMBERS` array defines team members with ID, name, role, and colors

- **App script** — Google Apps Script deployed as web app
  - `doGet()` — Returns all leave records from Google Sheet as JSON
  - `doPost(e)` — Receives leave submission, appends row to sheet
  - Sheet columns: S.No, Name, Member ID, From Date, End Date, Reason, WFH (Yes/No), Timestamp

- **.github/workflows/static.yml** — GitHub Pages deployment workflow
  - Triggers on push to main
  - Deploys entire repo root as static site

## Architecture & Data Flow

**Frontend → Backend:**
1. Frontend calls Google Apps Script endpoint (configured in `API_URL` in index.html)
2. doPost accepts JSON: `{name, id, from_leave, end_leave, reason, wfh}`
3. doGet returns JSON array of all leave records from sheet
4. Frontend auto-refreshes data every 30 seconds (`setInterval(loadSheetData, 30000)`)

**Member Data:**
- `MEMBERS` array is hardcoded in index.html — contains id, name, role, bg (avatar bg color), color (text color)
- Leave records keyed by member ID in `leaveData` object

**UI Structure:**
- Sticky header with search bar
- Sticky nav tabs for filtering (All, With Leaves, WFH, etc.)
- Member cards grid (responsive, auto-fill columns)
- Drawer overlay (member details + leave history, right-aligned)
- Modal overlay (leave application form with PIN protection)
- Toast notifications for feedback

## Common Development Tasks

### Testing Changes Locally
Since there's no build process, simply open `index.html` in a browser:
```bash
# Open in default browser
open index.html  # macOS
xdg-open index.html  # Linux
start index.html  # Windows

# Or use a local server to avoid CORS issues (if calling real API)
python3 -m http.server 8000
# Then visit http://localhost:8000
```

### Configuring Google Apps Script Endpoint
In index.html, find and update `API_URL`:
```javascript
const API_URL = "https://script.google.com/macros/d/{YOUR_SCRIPT_ID}/userweb";
```

### Adding a New Member
Edit the `MEMBERS` array in index.html. Each member needs:
```javascript
{
  id: "member_id",
  name: "Full Name",
  role: "Job Title",
  bg: "#hexcolor",        // Avatar background
  color: "#hexcolor"      // Avatar text color
}
```

### Styling Changes
All CSS is in the `<style>` tag in index.html. Uses CSS custom properties (variables):
- `--primary`, `--accent`, `--success`, `--danger`, `--warn` — status colors
- `--bg`, `--card`, `--border` — layout colors
- `--text`, `--muted`, `--subtle` — text colors

### Adding a New Filter Tab
In index.html, add a new nav item and corresponding filter function. Tabs are created by buttons that call JavaScript filter functions like `filterWithLeaves()`, `filterWFH()`, etc.

## Key JavaScript Functions

**Data Management:**
- `loadSheetData()` — Fetch leave records from Google Sheet
- `formatMemberCards()` — Render member grid based on current filter

**UI Interactions:**
- `openModal(id)` — Open leave application modal for member
- `closeModal()` — Close modal and reset form
- `openDrawer(id)` — Show member details and leave history sidebar
- `closeDrawer()` — Close sidebar
- `submitLeave()` — POST leave data to Google Apps Script

**Utilities:**
- `getDays(from, to)` — Calculate leave duration
- `getInitials(name)` — Get avatar initials
- `formatDate(date)` — Format date for display
- `getActualLeaveDays(leavesArray)` — Count total leave days (WFH doesn't count)
- `filterWithLeaves()`, `filterWFH()` — Filter functions for nav tabs

## Important Implementation Details

**PIN Protection:**
- Leave submission requires 4-digit PIN
- PIN digits stored in hidden inputs: `p1`, `p2`, `p3`, `p4`
- PIN validated before form submission

**WFH (Work From Home) Handling:**
- Stored as "Yes" or "No" string in sheet column G
- WFH days do NOT count toward leave day total (see `getActualLeaveDays`)
- Styled differently in UI (green badge vs blue badge)

**Date Handling:**
- Single-day leaves: `from_leave` and `end_leave` are the same
- Multi-day leaves: `from_leave` is start, `end_leave` is end date
- All dates passed to/from Google Apps Script

**Search & Filter:**
- Search filters displayed members by name/ID (real-time)
- Nav tabs filter which members appear and which counts show badges
- Currently applied filter state in `.active` class on nav item

**Responsive Design:**
- Card grid uses `grid-template-columns: repeat(auto-fill, minmax(190px, 1fr))`
- Header and nav are sticky
- Drawer and modal use fixed positioning overlays

## Deployment

GitHub Pages automatically deploys on any push to main via the static.yml workflow. The site is served from the repo root (`index.html` at `https://[repo-url]/`).

To update the live site, commit changes to main and push:
```bash
git add index.html "App script"
git commit -m "Update leave tracker"
git push origin main
```

## Notes for Future Development

- **No dependencies** — No npm, no build tools, no package.json. This keeps deployment and maintenance simple.
- **Google Apps Script ID** — The API endpoint URL must be updated when deploying the script (found in Google Cloud Console)
- **CORS** — If fetching from a different origin, Google Apps Script must be deployed as a web app
- **Member List** — Currently hardcoded. Consider moving to Google Sheet or API if it needs to be dynamic
- **Data Storage** — All leaves are stored in a single Google Sheet; partition strategy may be needed if data grows significantly
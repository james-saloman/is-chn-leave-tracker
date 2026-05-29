# Development Flow

Guide for developing and maintaining the IS_CHN Leave Tracker.

## Local Setup

### Prerequisites
- A modern web browser (Chrome, Firefox, Safari, Edge)
- Python 3 (for local server)
- Access to Google Apps Script deployment URL

### Getting Started

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd is-chn-leave-tracker
   ```

2. **Start local server:**
   ```bash
   python3 -m http.server 8000
   ```
   Then open `http://localhost:8000` in your browser.

3. **Configure API endpoint:**
   - Update `API_URL` in `script.js` with your Google Apps Script deployment URL
   - Format: `https://script.google.com/macros/s/{SCRIPT_ID}/exec`

## Project Structure

```
is-chn-leave-tracker/
├── index.html              # HTML structure and DOM layout
├── script.js               # JavaScript logic and state management
├── styles.css              # Styling with CSS custom properties
├── image/                  # Logo and assets
├── CLAUDE.md               # Developer guidance
├── DEVELOPMENT.md          # This file
└── .github/
    └── workflows/
        └── static.yml      # GitHub Pages deployment
```

## Development Workflow

### 1. Feature Development

**Step 1: Plan the change**
- Review related functions in `script.js`
- Check affected CSS in `styles.css`
- Test locally before committing

**Step 2: Implement**
- Edit `script.js` for logic, `styles.css` for styling, `index.html` for structure
- Test in browser at `http://localhost:8000`
- Verify Google Sheet integration works

**Step 3: Test**
- Test in multiple browsers/devices
- Verify leave submission workflow
- Check data loads correctly from Google Sheet
- Test all filter/view switching

**Step 4: Commit and push**
```bash
git add .
git commit -m "feat/fix: description of change"
git push origin main
```

### 2. Bug Fixes

1. Reproduce the issue locally
2. Identify the root cause in `script.js`, `styles.css`, or `index.html`
3. Make minimal fix (no refactoring)
4. Test fix doesn't break other features
5. Commit with clear message: `fix: what was broken and how it's fixed`

### 3. Data Issues

**Checking Google Sheet:**
- Leave records are stored in Google Sheet backend
- Access via Google Apps Script `doGet()` and `doPost()` endpoints
- Sheet columns: S.No, Name, Member ID, From Date, End Date, Reason, WFH, Timestamp

**Frontend data loading:**
- `loadSheetData()` fetches all leave records every 30 seconds
- `loadMembers()` fetches member list on app initialization
- Data is stored in `leaveData` object keyed by member ID

### 4. View System

The app has three views, controlled by `currentView` state:

**Overview View** (`renderOverviewView()`)
- Real-time team statistics
- Member cards with leave counts
- Quick access to member details

**Calendar View** (`renderCalendarView()`)
- Month/year selector
- Leave visualization by day
- Color-coded member indicators

**Summary View** (`renderSummaryView()`)
- Date range selection
- Detailed leave statistics
- Professional filter

### 5. Adding Features

**Add a new view:**
1. Create `renderNewView()` function in `script.js`
2. Add styling rules to `styles.css`
3. Add nav button to `index.html`
4. Call `switchView('newview')` on button click
5. Implement view rendering logic

**Add a filter:**
1. Create filter function in `script.js` (e.g., `filterByDepartment()`)
2. Update `formatMemberCards()` to apply filter
3. Add filter button to nav in `index.html`
4. Update `activeFilter` state

**Add a modal/form:**
1. Add HTML structure to `index.html`
2. Create open/close functions in `script.js`
3. Add submit handler that calls Google Apps Script
4. Add styling to `styles.css`

## Styling Guide

### CSS Variables (in `styles.css`)

**Colors:**
- `--primary`: Main brand color (#1a3c5e)
- `--accent`: Interactive elements (#2563eb)
- `--success`: Success states (#15803d)
- `--danger`: Error/destructive actions (#dc2626)
- `--warn`: Warnings (#b45309)

**Layout:**
- `--bg`: Page background (#f4f7fb)
- `--card`: Card/modal background (#fff)
- `--border`: Border color (#dde3ef)

**Text:**
- `--text`: Primary text (#1e293b)
- `--muted`: Secondary text (#64748b)
- `--subtle`: Tertiary text (#94a3b8)

### Common Classes

- `.btn-*`: Button styles
- `.card`: Card container
- `.modal`: Modal overlay
- `.badge`: Status badges
- `.sticky`: Sticky positioning

## Testing Checklist

Before committing:

- [ ] Runs locally without errors (`http://localhost:8000`)
- [ ] All three views render correctly
- [ ] Leave form submits successfully
- [ ] Data loads from Google Sheet
- [ ] Member filter works
- [ ] Search functionality works
- [ ] Modal dialogs open/close properly
- [ ] Responsive on mobile/tablet
- [ ] No console errors

## Deployment

### Automatic Deployment

- Push to `main` branch triggers `.github/workflows/static.yml`
- GitHub Actions builds and deploys to GitHub Pages
- Site is live at repository GitHub Pages URL

### Manual Verification

After deployment:
1. Visit the live GitHub Pages URL
2. Verify data loads correctly
3. Test leave submission
4. Check all views render properly

## Common Tasks

### Update Member List

Members are dynamically loaded from Google Sheet. To add/remove:
1. Use the "+ Add Professional" button in the UI
2. Or edit the members sheet directly

### Change Colors/Branding

Edit CSS variables in `styles.css` `:root`:
```css
:root {
  --primary: #new-color;
  --accent: #new-color;
  /* ... */
}
```

### Update API Endpoint

Edit `script.js`:
```javascript
const API_URL = "https://script.google.com/macros/s/{NEW_SCRIPT_ID}/exec";
```

### Debug Leave Data

1. Open browser DevTools (F12)
2. Check Network tab for API calls to Apps Script
3. Log `leaveData` and `MEMBERS` in console
4. Verify Google Sheet data structure matches expectations

## Performance Considerations

- **Data polling:** Refreshes every 30 seconds (`setInterval(loadSheetData, 30000)`)
- **Large member lists:** Consider pagination if list grows significantly
- **Leave record growth:** Monitor Google Sheet size; partition by year if needed
- **Color picker:** 8-color palette loaded from `COLOR_PALETTE` in `script.js`

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (test calendar features)
- Mobile browsers: Responsive design tested

## Troubleshooting

### Data not loading
- Check `API_URL` in `script.js`
- Verify Google Apps Script deployment is active
- Check browser console for network errors
- Verify CORS is not blocking requests

### Styling looks broken
- Clear browser cache (Ctrl+Shift+Delete)
- Check `styles.css` is loaded in Network tab
- Verify CSS variable values in DevTools
- Check for browser-specific CSS issues

### Members not appearing
- Verify `loadMembers()` is called on page load
- Check Google Sheet has member data
- Verify member columns match expected format
- Check `MEMBERS` array in console

## Git Workflow

```bash
# Create feature branch
git checkout -b feat/feature-name

# Make changes, test locally
# ...

# Commit with descriptive message
git commit -m "feat: clear description of what changed"

# Push to main (or create PR for review)
git push origin feat/feature-name

# After merge/push to main:
# - GitHub Actions auto-deploys
# - Check live site after deployment
```

## Resources

- [Google Apps Script Documentation](https://developers.google.com/apps-script)
- [MDN Web Docs](https://developer.mozilla.org)
- [CSS Custom Properties Guide](https://developer.mozilla.org/en-US/docs/Web/CSS/--*)
- Project CLAUDE.md for architecture details

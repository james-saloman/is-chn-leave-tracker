# IS-CHN Leave Tracker - Complete Documentation

A modern leave management dashboard for team members to apply for leave and view leave records. Built with vanilla HTML/CSS/JavaScript frontend and Node.js backend, backed by SharePoint Excel.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Architecture](#architecture)
3. [Azure Setup](#azure-setup)
4. [Deployment Guide](#deployment-guide)
5. [API Reference](#api-reference)
6. [Troubleshooting](#troubleshooting)
7. [Common Tasks](#common-tasks)

---

## Quick Start

### For End Users

Visit the deployed site: `https://<username>.github.io/is-chn-leave-tracker/`

1. View team members and their leave counts
2. Click "Apply Leave" to submit a leave request
3. Fill in date, reason, and your PIN
4. Submit — data syncs to SharePoint Excel

### For Developers

#### Prerequisites
- Node.js 14+ (for backend)
- Python 3 (for local server)
- Azure account (free tier)
- Git and GitHub

#### Local Development Setup

```bash
# 1. Backend setup
cd backend
cp .env.example .env
# Edit .env with your Azure credentials (see Azure Setup section)

npm install
npm start
# Backend runs at http://localhost:3000/api

# 2. In another terminal, start frontend
python3 -m http.server 8000
# Frontend runs at http://localhost:8000
```

#### Making Changes

**Frontend changes** (index.html):
- Edit and refresh browser
- No build process needed

**Backend changes** (backend/index.js):
- Edit and restart `npm start`
- Or use `npm run dev` for auto-reload

**Testing Leave Submission**:
1. Visit http://localhost:8000
2. Click member's "Apply Leave" button
3. Fill form with test data
4. Enter member PIN (from MEMBERS array in index.html)
5. Submit
6. Check SharePoint Excel — new row should appear

---

## Architecture

### System Overview

The Leave Tracker is a simple two-tier application:
- **Frontend**: Static HTML/CSS/JavaScript on GitHub Pages
- **Backend**: Node.js API on Render that reads/writes to SharePoint Excel

All leave data is stored in a single Excel file on SharePoint (no database required).

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     GitHub Pages (Frontend)                 │
│                    index.html (vanilla JS)                  │
│                                                             │
│  - Member cards with leave status                           │
│  - Leave application modal with PIN protection              │
│  - Leave history drawer                                     │
│  - Auto-refreshes every 30 seconds                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP (CORS enabled)
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                  Render (Backend API)                       │
│                 Node.js + Express Server                    │
│                                                             │
│  GET  /api/leaves  → Read Excel file from SharePoint        │
│  POST /api/leaves  → Append row to Excel file               │
│  GET  /api/health  → Health check                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Microsoft Graph API
                         │
                         ↓
┌─────────────────────────────────────────────────────────────┐
│              SharePoint Online (Data Storage)               │
│                                                             │
│   Excel File: Leave Tracker.xlsx                            │
│     Sheet: Sheet1                                           │
│     Columns: S.No | Name | Member ID | From Date | To Date  │
│              | Reason | Work From Home                      │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

#### Reading Leave Records
1. Frontend calls `GET /api/leaves`
2. Backend authenticates with Azure AD using client credentials
3. Backend opens an Excel session via Microsoft Graph API
4. Backend reads the used range from Sheet1
5. Backend converts Excel rows to JSON and returns to frontend
6. Frontend renders member cards with leave count
7. Frontend auto-refreshes every 30 seconds

#### Submitting a Leave Request
1. User fills out form (Date, Reason, WFH, PIN)
2. Frontend validates PIN against hardcoded MEMBERS array
3. Frontend calls `POST /api/leaves` with leave details
4. Backend authenticates with Azure AD
5. Backend opens an Excel session with `persistChanges: true`
6. Backend finds the next available row number
7. Backend appends a new row with leave details
8. Backend closes the session (changes are saved)
9. Frontend shows success message
10. Frontend reloads data via `loadSheetData()`

### Key Components

#### Frontend (index.html)
- **Size**: 592 lines
- **No build process** — runs directly as static HTML
- **Dependencies**: None (vanilla JavaScript)
- **Key Variables**:
  - `API_URL` — Points to backend (localhost in dev, Render in prod)
  - `MEMBERS` — Array defining team members with PIN

#### Backend
- **index.js** — Express server with API endpoints
- **package.json** — Dependencies (express, cors, axios)
- **.env** — Environment variables (never committed)

#### Data Storage
- **Location**: SharePoint Online
- **File**: Leave Tracker.xlsx
- **Sheet**: Sheet1
- **Columns**: S.No, Name, Member ID, From Date, To Date, Reason, Work From Home

### Technology Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Frontend** | Vanilla HTML/CSS/JS | Simple, no dependencies, fast |
| **Backend** | Node.js + Express | Lightweight, easy to host on Render |
| **Data** | SharePoint Excel | Already in use, familiar UI, no DB setup |
| **Auth** | Azure AD (client credentials) | Enterprise-grade, free tier available |
| **API** | Microsoft Graph | Official SharePoint integration |
| **Hosting** | GitHub Pages + Render | Free tier, automatic deployments |

### Cost Estimate (Annual)

| Service | Tier | Cost |
|---------|------|------|
| GitHub Pages | Free | $0 |
| Render | Free | $0 |
| SharePoint | Included | $0 |
| Azure AD | Free | $0 |
| **Total** | — | **$0** |

All services use free tier with no cost.

---

## Azure Setup

### Step 1: Register Azure Application

1. Go to [Azure Portal](https://portal.azure.com)
2. In the left sidebar, click **Azure Active Directory**
3. Click **App registrations**
4. Click **New registration**
5. Fill in:
   - **Name**: `CSI Leave Tracker API`
   - **Supported account types**: `Single tenant`
   - **Redirect URI**: Leave blank
6. Click **Register**

### Step 2: Create Client Secret

1. Click **Certificates & secrets** in your new app
2. Click **New client secret**
3. Add description: `Backend API`
4. Set expiry to 24 months
5. Click **Add**
6. **Copy the Value** — this is your `CLIENT_SECRET`

⚠️ Keep this secret safe! If you lose it, create a new one.

### Step 3: Get Application IDs

In the app overview, copy:
- **Application (client) ID** → `CLIENT_ID`
- **Directory (tenant) ID** → `TENANT_ID`

### Step 4: Add API Permissions

1. Click **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Click **Application permissions**
5. Search and select: `Sites.ReadWrite.All`
6. Click **Add permissions**
7. Click **Grant admin consent for [Organization]** and confirm

### Step 5: Get SharePoint Site ID

The SharePoint Site ID can be found using the Microsoft Graph API:

```bash
# Get access token first (using credentials from Step 2-3)
curl -X POST "https://login.microsoftonline.com/{TENANT_ID}/oauth2/v2.0/token" \
  -d "client_id={CLIENT_ID}&client_secret={CLIENT_SECRET}&scope=https://graph.microsoft.com/.default&grant_type=client_credentials"

# Then list SharePoint sites
curl -X GET "https://graph.microsoft.com/v1.0/sites/bw1.sharepoint.com:/sites/InternalISTeamProjectBackup" \
  -H "Authorization: Bearer {access_token}"
```

Extract the `id` value and use the `siteId` part as `SHAREPOINT_SITE_ID`.

### Step 6: Get Excel File ID

1. Open your Excel file in SharePoint: https://bw1.sharepoint.com/sites/InternalISTeamProjectBackup
2. Click the **Info** button (top right)
3. Copy the **Item ID** as `EXCEL_ITEM_ID`

Or use Microsoft Graph:

```bash
curl -X GET "https://graph.microsoft.com/v1.0/sites/{SHAREPOINT_SITE_ID}/drive/root/children" \
  -H "Authorization: Bearer {access_token}" | jq '.value[] | select(.name=="*Leave*")'
```

### Step 7: Configure Backend

Create `backend/.env`:

```
PORT=3000
TENANT_ID=your-tenant-id-here
CLIENT_ID=your-client-id-here
CLIENT_SECRET=your-client-secret-here
SHAREPOINT_SITE_ID=your-site-id-here
EXCEL_ITEM_ID=your-excel-file-id-here
NODE_ENV=development
```

### Step 8: Test Connection

```bash
cd backend
npm install
npm start
```

Visit http://localhost:3000/api/health — should return:
```json
{"status":"ok"}
```

### Troubleshooting Azure Setup

| Issue | Solution |
|-------|----------|
| "Invalid client" | Check CLIENT_ID and TENANT_ID |
| "Admin consent required" | Grant admin consent in API permissions |
| "Access denied" | Verify Sites.ReadWrite.All permission is granted |
| "File not found" | Verify EXCEL_ITEM_ID and file exists |

---

## Deployment Guide

### Local Development Testing

Before deploying, test everything locally:

#### Phase 1: Backend Testing (10 minutes)

```bash
cd backend
cp .env.example .env
# Edit .env with your Azure credentials

npm install
npm start
```

Test health endpoint:
```bash
curl http://localhost:3000/api/health
# Should return: {"status":"ok"}
```

#### Phase 2: Frontend Testing (5 minutes)

In another terminal:
```bash
python3 -m http.server 8000
```

Visit http://localhost:8000 and test:
- [ ] Members load and display
- [ ] Click "Apply Leave" button
- [ ] Fill out form with test data
- [ ] Enter member PIN
- [ ] Submit
- [ ] Check that row appears in Excel in SharePoint

#### Phase 3: Commit Code (5 minutes)

```bash
git status
# Should show index.html and backend/ changes

git add index.html backend/ CLAUDE.md DOCUMENTATION.md
git commit -m "Add SharePoint-based backend and deployment"
git push origin main
```

### Production Deployment

#### Phase 1: Deploy Backend to Render (10 minutes)

1. Go to [render.com](https://render.com)
2. Sign in with GitHub
3. Click **New → Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Name**: `csi-leave-tracker-api`
   - **Environment**: `Node`
   - **Build Command**: `npm install --prefix backend`
   - **Start Command**: `npm start --prefix backend`
6. Click **Create Web Service**

#### Phase 2: Add Environment Variables

While the service is deploying, go to **Settings** and add:

```
TENANT_ID=your-tenant-id
CLIENT_ID=your-client-id
CLIENT_SECRET=your-client-secret
SHAREPOINT_SITE_ID=your-site-id
EXCEL_ITEM_ID=your-excel-file-id
NODE_ENV=production
```

Save — Render will restart the service.

#### Phase 3: Verify Deployment

Wait for green "Live" indicator, then visit:
```
https://csi-leave-tracker-api.onrender.com/api/health
```

Should return: `{"status":"ok"}`

**Note**: First request might be slow (cold start) — refresh after 10 seconds.

#### Phase 4: Update Frontend API URL

In `index.html`, find:

```javascript
const API_URL = "http://localhost:3000/api";
```

Replace with:

```javascript
const API_URL = "https://csi-leave-tracker-api.onrender.com/api";
```

#### Phase 5: Deploy Frontend

```bash
git add index.html
git commit -m "Update API endpoint to production backend"
git push origin main
```

GitHub Pages auto-deploys. Check:
1. GitHub Actions shows ✅ workflow passed
2. Visit your site: `https://<username>.github.io/is-chn-leave-tracker/`
3. Open DevTools (F12) — no CORS errors

#### Phase 6: Test Production (5 minutes)

1. Visit your live site
2. Wait for members to load
3. Click a member → "Apply Leave"
4. Fill form with test data
5. Enter member PIN
6. Submit
7. Check SharePoint Excel file for new row
8. Refresh page — new row should appear in member's history

### Production Checklist

Before going live:

**Security**:
- [ ] CLIENT_SECRET is NOT in any Git commits
- [ ] .env file is in .gitignore
- [ ] API_URL points to HTTPS (not HTTP)
- [ ] CORS is configured appropriately

**Reliability**:
- [ ] Render monitoring is enabled
- [ ] Tested with slow network (DevTools throttle)
- [ ] Tested error cases (invalid PIN, missing fields)
- [ ] Auto-refresh is working (check Network tab)

**Operations**:
- [ ] Know how to update credentials (Render dashboard)
- [ ] Know how to check backend logs (Render Logs tab)
- [ ] Excel file is backed up
- [ ] Know how to rotate CLIENT_SECRET (Azure Portal)

---

## API Reference

### GET `/api/leaves`

Fetch all leave records from SharePoint Excel.

**Response:**
```json
[
  {
    "sNo": 1,
    "name": "John Doe",
    "member_id": "M001",
    "from_date": "2026-05-25",
    "to_date": "2026-05-27",
    "reason": "Personal leave",
    "work_from_home": "No"
  }
]
```

### POST `/api/leaves`

Submit a new leave request.

**Request:**
```json
{
  "name": "John Doe",
  "id": "M001",
  "from_leave": "2026-05-25",
  "end_leave": "2026-05-27",
  "reason": "Personal leave",
  "wfh": false
}
```

**Response:**
```json
{"status": "ok"}
```

### GET `/api/health`

Health check endpoint.

**Response:**
```json
{"status": "ok"}
```

---

## Troubleshooting

### Backend Issues

| Problem | Solution |
|---------|----------|
| Backend won't start | Check Render logs: Dashboard → Logs tab. Verify all .env variables are set. Restart the service. |
| Excel file not updating | Verify SHAREPOINT_SITE_ID and EXCEL_ITEM_ID are correct. Check Azure permissions (Sites.ReadWrite.All). |
| CORS errors in browser | Verify API_URL in index.html matches Render URL. Check backend CORS config. Hard-refresh (Ctrl+Shift+R). |
| Access denied errors | Verify Sites.ReadWrite.All permission in Azure. Create new client secret if needed. |
| Health check fails | Verify NODE_ENV and all environment variables. Check Azure credentials. |

### Frontend Issues

| Problem | Solution |
|---------|----------|
| Members not loading | Check browser console (F12) for API errors. Verify API_URL is correct. |
| Can't submit leave | Verify PIN is 4 digits and matches MEMBERS array. Check network in DevTools. |
| App loads but is empty | Verify API_URL is accessible. Check browser console for CORS errors. |
| Changes not showing up | Hard-refresh (Ctrl+Shift+R). Clear browser cache. |

### Common Solutions

```bash
# Test backend health
curl https://csi-leave-tracker-api.onrender.com/api/health

# Test getting all leaves
curl https://csi-leave-tracker-api.onrender.com/api/leaves

# Check Render logs
# Go to Render dashboard → Service → Logs tab

# Check frontend console
# Visit site, press F12, click Console tab
```

---

## Common Tasks

### Adding a New Team Member

1. Edit `index.html`
2. Find `const MEMBERS = [`
3. Add a new entry:
   ```javascript
   {
     id: "M003",
     pin: "5678",
     name: "Jane Smith",
     role: "Designer",
     color: "#dc2626",
     bg: "#fee2e2"
   }
   ```
4. Commit and push
5. Site auto-updates in 1-2 minutes

### Updating Member Information

1. Edit `index.html`
2. Find member in `MEMBERS` array
3. Update fields (name, role, color, bg)
4. Commit and push

### Changing Member's PIN

1. Edit `index.html`
2. Find member in `MEMBERS` array
3. Change `pin` value (must be 4 digits)
4. Commit and push

### Updating Colors/Styling

Edit CSS in `index.html` `<style>` tag or edit colors in `MEMBERS` array:
- `color` — Avatar text color
- `bg` — Avatar background color

Commit and push.

### Viewing Historical Data

1. Open SharePoint Excel file
2. Sort by "From Date" or "Timestamp"
3. Or download and analyze in Excel/CSV

### Rotating Azure Credentials

If credentials are compromised:

1. Azure Portal → App registrations → your app
2. Certificates & secrets → New client secret
3. Copy the new value
4. Render dashboard → Environment variables → update CLIENT_SECRET
5. Delete old secret from Azure
6. Service auto-restarts with new credentials

### Disabling Leave Submissions Temporarily

If you need to disable the backend temporarily:

1. Go to Render dashboard
2. Click your service
3. Click Settings → Suspend Service
4. Frontend still works but "Apply Leave" won't work
5. Users will see error when submitting

### Exporting Leave Data

1. Open SharePoint Excel file: https://bw1.sharepoint.com/sites/InternalISTeamProjectBackup
2. Download the file
3. Analyze in Excel or export to CSV

### Monitoring System Health

**Daily**:
- [ ] Backend service shows "Live" in Render
- [ ] Check that new leaves appear in Excel

**Weekly**:
- [ ] Review Render logs for errors
- [ ] Verify recent leave entries in Excel

**Monthly**:
- [ ] Check Azure API usage (under quota?)
- [ ] Verify Render doesn't have issues
- [ ] Consider rotating CLIENT_SECRET

### Emergency Rollback

If something breaks in production:

```bash
# Frontend
git log --oneline | head -5
git revert <commit-hash>
git push origin main
# Auto-deploys in 1-2 minutes

# Backend
# Go to Render dashboard
# Click your service
# Click "Previous Deployment"
# Click "Deploy"
```

---

## Additional Resources

### Key Files

| File | Purpose |
|------|---------|
| `index.html` | Frontend UI and logic |
| `backend/index.js` | Backend API server |
| `backend/package.json` | Node dependencies |
| `CLAUDE.md` | Project instructions |
| `DOCUMENTATION.md` | This file |

### Commands Reference

```bash
# Backend
npm start                           # Start backend
npm run dev                         # Start with auto-reload
npm install                         # Install dependencies

# Git
git status                          # Check changes
git add .                           # Stage all changes
git commit -m "message"             # Create commit
git push origin main                # Deploy to production

# Testing
curl http://localhost:3000/api/health          # Test health
curl http://localhost:3000/api/leaves          # Get all leaves
python3 -m http.server 8000                    # Start local server
```

### Getting Help

| Question | Answer |
|----------|--------|
| "How do I set up Azure?" | See [Azure Setup](#azure-setup) section |
| "How do I deploy?" | See [Deployment Guide](#deployment-guide) section |
| "How does the system work?" | See [Architecture](#architecture) section |
| "How do I...?" | See [Common Tasks](#common-tasks) section |

---

**Status**: ✅ Live in Production  
**Last Updated**: May 2026

Built for the CSI team at Design Group.

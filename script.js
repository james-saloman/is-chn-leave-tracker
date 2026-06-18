// Google Apps Script deployment URL
const API_URL = "https://script.google.com/macros/s/AKfycbxgYMKh6QNyntAwirW2kgl99vJlHVByPJAW3zjbcZusIBVAeeXc7HY7Dtm4MFRu7Fn0/exec";

const DEFAULT_MEMBERS = [];

const COLOR_PALETTE = [
  {bg:"#dbeafe", color:"#2563eb"},
  {bg:"#ede9fe", color:"#7c3aed"},
  {bg:"#cffafe", color:"#0891b2"},
  {bg:"#d1fae5", color:"#059669"},
  {bg:"#fef3c7", color:"#d97706"},
  {bg:"#fee2e2", color:"#dc2626"},
  {bg:"#fce7f3", color:"#be185d"},
  {bg:"#dbeafe", color:"#0369a1"},
];

let MEMBERS = [];
let leaveData = {};
let currentMemberId = null;
let selectedColorIndex = 0;
let currentCalendarDate = new Date();
let activeFilter = "all";
let currentView = "calendar";

// Tracks when the overlay first appeared so we can enforce a minimum display time.
const LOADER_START = Date.now();
const LOADER_MIN_MS = 800;
let loaderHidden = false;

// Hide the loading overlay once the initial data fetch is done.
// Keeps the overlay up for at least LOADER_MIN_MS so it doesn't flash on fast loads.
function hideLoadingOverlay() {
  if (loaderHidden) return;
  loaderHidden = true;
  const elapsed = Date.now() - LOADER_START;
  const wait = Math.max(0, LOADER_MIN_MS - elapsed);
  setTimeout(() => {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) {
      overlay.classList.add("hidden");
      setTimeout(() => overlay.remove(), 400);
    }
  }, wait);
}

document.addEventListener("DOMContentLoaded", async function() {
  // Safety net: never let the overlay hang if the fetch never resolves.
  setTimeout(hideLoadingOverlay, 10000);

  // Close modals on Escape
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape") {
      closeModal();
      closeAddMemberModal();
    }
  });

  // Close leave modal on backdrop click
  document.getElementById("leaveOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeModal();
  });

  // Close add member modal on backdrop click
  document.getElementById("addMemberOverlay").addEventListener("click", function(e) {
    if (e.target === this) closeAddMemberModal();
  });

  await loadMembers();
  initColorPicker();
  initSummaryDates();
  init();
});

function init() {
  MEMBERS.forEach(m => leaveData[m.id] = []);
  buildNav();
  loadSheetData();
  updateOverview();
}

function buildNav() {
  const select = document.getElementById("memberFilterSelect");
  select.innerHTML = `<option value="all">All Professionals</option>`;
  MEMBERS.forEach(m => {
    const option = document.createElement("option");
    option.value = m.id;
    option.textContent = m.name;
    select.appendChild(option);
  });
}

async function loadSheetData() {
  try {
    const res = await fetch(API_URL);
    const json = await res.json();
    console.log("Leave data response:", json);

    MEMBERS.forEach(m => leaveData[m.id] = []);

    if (json.status === "success" && json.data) {
      json.data.forEach(row => {
        if (row.id && leaveData[row.id]) {
          leaveData[row.id].push({
            from: row.from_leave,
            to: row.end_leave,
            reason: row.reason || "",
            wfh: (row.wfh || "No").toString(),
            duration: parseFloat(row.duration) === 0.5 ? 0.5 : 1
          });
        }
      });
    }

    renderCalendar();
    updateOverview();

  } catch (err) {
    console.error("Error loading data:", err);
    renderCalendar();
    updateOverview();
  } finally {
    // Hide the loading overlay only after the initial fetch resolves (success or error).
    hideLoadingOverlay();
  }
}

// Day count for a record, honoring a half-day (0.5) duration.
// Half day only applies to single-day records; multi-day spans always count full days.
function getLeaveSpan(l) {
  const days = getDays(l.from, l.to);
  return (days === 1 && parseFloat(l.duration) === 0.5) ? 0.5 : days;
}

// Count only non-WFH entries as leave days
function getActualLeaveDays(leaves) {
  return leaves
    .filter(l => (l.wfh || "No") !== "Yes")
    .reduce((a, l) => a + getLeaveSpan(l), 0);
}

// Count only WFH entries
function getWFHDays(leaves) {
  return leaves
    .filter(l => (l.wfh || "No") === "Yes")
    .reduce((a, l) => a + getLeaveSpan(l), 0);
}

function updateOverview() {
  const today = new Date().toISOString().split("T")[0];
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);

  // Count stats
  const todayAbsences = getAbsencesForDate(today);
  const membersOnLeaveToday = todayAbsences.filter(a => a.wfh !== "Yes").length;
  const membersWFHToday = todayAbsences.filter(a => a.wfh === "Yes").length;

  // Calculate total leave days this month
  let totalLeaveDaysMonth = 0;
  MEMBERS.forEach(m => {
    const leaves = leaveData[m.id] || [];
    leaves.forEach(l => {
      const leaveStart = new Date(l.from);
      const leaveEnd = new Date(l.to);
      if (leaveEnd >= monthStart && leaveStart <= monthEnd && l.wfh !== "Yes") {
        const overlapStart = new Date(Math.max(leaveStart.getTime(), monthStart.getTime()));
        const overlapEnd = new Date(Math.min(leaveEnd.getTime(), monthEnd.getTime()));
        const overlapDays = getDays(
          overlapStart.toISOString().split("T")[0],
          overlapEnd.toISOString().split("T")[0]
        );
        // Apply half-day only to single-day records counted in full within the month
        totalLeaveDaysMonth += (getDays(l.from, l.to) === 1 && parseFloat(l.duration) === 0.5)
          ? 0.5
          : overlapDays;
      }
    });
  });

  // Update header stats
  document.getElementById("overviewTotalMembers").textContent = MEMBERS.length;
  document.getElementById("overviewMembersOnLeave").textContent = membersOnLeaveToday;
  document.getElementById("overviewMembersWFH").textContent = membersWFHToday;

  // Update today's status
  updateTodayStatus(todayAbsences, today);

  // Update team utilization
  updateTeamUtilization();

  // Update member cards
  updateOverviewMemberCards();
}

function updateTodayStatus(absences, today) {
  const container = document.getElementById("overviewTodayStatus");
  const dateDisplay = new Date(today).toLocaleDateString("en-GB", {day: "numeric", month: "short", year: "numeric"});

  if (absences.length === 0) {
    container.innerHTML = `<div style="padding:12px;background:#dcfce7;border-radius:8px;border-left:3px solid #15803d;font-size:13px;color:#15803d">✓ Full team present</div>`;
  } else {
    const leaveMembers = absences.filter(a => a.wfh !== "Yes");
    const wfhMembers = absences.filter(a => a.wfh === "Yes");
    let html = "";
    if (leaveMembers.length > 0) {
      html += `<div style="padding:10px;background:#fee2e2;border-radius:8px;border-left:3px solid #dc2626;font-size:12px;color:#991b1b">
        <strong>On Leave:</strong> ${leaveMembers.map(a => a.name).join(", ")}
      </div>`;
    }
    if (wfhMembers.length > 0) {
      html += `<div style="padding:10px;background:#fef3c7;border-radius:8px;border-left:3px solid #b45309;font-size:12px;color:#78350f">
        <strong>WFH:</strong> ${wfhMembers.map(a => a.name).join(", ")}
      </div>`;
    }
    container.innerHTML = html;
  }
}

function updateTeamUtilization() {
  const container = document.getElementById("overviewTeamUtilization");
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  let stats = {
    onLeave: 0,
    wfh: 0,
    present: MEMBERS.length
  };

  MEMBERS.forEach(m => {
    const leaves = leaveData[m.id] || [];
    let hasLeaveThisMonth = false;
    let hasWFHThisMonth = false;

    leaves.forEach(l => {
      const leaveStart = new Date(l.from);
      const leaveEnd = new Date(l.to);
      if (leaveEnd >= monthStart && leaveStart <= monthEnd) {
        if (l.wfh === "Yes") hasWFHThisMonth = true;
        else hasLeaveThisMonth = true;
      }
    });

    if (hasLeaveThisMonth) stats.onLeave++;
    if (hasWFHThisMonth && !hasLeaveThisMonth) stats.wfh++;
  });

  const todayStr = today.toISOString().split("T")[0];
  const membersOnLeaveToday = getAbsencesForDate(todayStr).filter(a => a.wfh !== "Yes").length;
  const activeToday = MEMBERS.length - membersOnLeaveToday;
  const html = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border)">
      <span style="font-size:12px;color:var(--muted)">Team attendance</span>
      <span style="font-size:14px;font-weight:600;color:var(--accent)">${Math.round((activeToday / MEMBERS.length) * 100)}% active</span>
    </div>
    <div style="display:flex;gap:4px;height:6px;border-radius:3px;overflow:hidden;background:#e2e8f0">
      <div style="flex:${activeToday};background:var(--success)"></div>
      <div style="flex:${MEMBERS.length - activeToday};background:var(--danger)"></div>
    </div>
  `;
  container.innerHTML = html;
}

function updateOverviewMemberCards() {
  const container = document.getElementById("overviewMemberCards");
  const today = new Date().toISOString().split("T")[0];
  const todayAbsences = getAbsencesForDate(today);
  const cardFilterPeriod = window.cardFilterPeriod || 'all';

  const html = MEMBERS.map(m => {
    const absence = todayAbsences.find(a => a.id === m.id);
    const allLeaves = leaveData[m.id] || [];
    const filteredLeaves = cardFilterPeriod === 'all' ? allLeaves : filterLeavesByPeriod(allLeaves, cardFilterPeriod);
    const total = getActualLeaveDays(filteredLeaves);
    const wfh = getWFHDays(filteredLeaves);

    let statusBadge = '<span style="background:#dcfce7;color:#15803d;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:500">✓ Present</span>';
    if (absence) {
      if (absence.wfh === "Yes") {
        statusBadge = '<span style="background:#fef3c7;color:#b45309;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:500">🏠 WFH</span>';
      } else {
        statusBadge = '<span style="background:#fee2e2;color:#dc2626;font-size:11px;padding:3px 8px;border-radius:20px;font-weight:500">Away</span>';
      }
    }

    return `
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:1rem;text-align:center;cursor:pointer" onclick="openDrawer('${m.id}')">
        <div style="width:48px;height:48px;border-radius:50%;background:${m.bg};color:${m.color};display:flex;align-items:center;justify-content:center;font-weight:600;font-size:16px;margin:0 auto 0.5rem">${getInitials(m.name)}</div>
        <div style="font-size:13px;font-weight:600;margin-bottom:2px">${m.name}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:0.5rem">${m.role}</div>
        <div style="margin-bottom:8px">${statusBadge}</div>
        <div style="font-size:11px;color:var(--muted);display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
          <span><strong style="color:var(--accent)">${total}</strong> PTO</span>
          ${wfh > 0 ? `<span>|  <strong style="color:#15803d">${wfh}</strong> WFH</span>` : ''}
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = html;
}

function renderCalendar() {
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  document.getElementById("calendarTitle").textContent = currentCalendarDate.toLocaleDateString("en-US", {month: "long", year: "numeric"});

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  let days = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({date: new Date(year, month - 1, daysInPrevMonth - i), otherMonth: true});
  }

  for (let d = 1; d <= daysInMonth; d++) {
    days.push({date: new Date(year, month, d), otherMonth: false});
  }

  const remaining = 42 - days.length;
  for (let d = 1; d <= remaining; d++) {
    days.push({date: new Date(year, month + 1, d), otherMonth: true});
  }

  const container = document.getElementById("calendarDays");
  container.innerHTML = "";

  days.forEach(day => {
    const dateStr = `${day.date.getFullYear()}-${String(day.date.getMonth() + 1).padStart(2, '0')}-${String(day.date.getDate()).padStart(2, '0')}`;
    const today = (() => {
      const t = new Date();
      return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    })();
    const absences = getAbsencesForDate(dateStr);

    const dayEl = document.createElement("div");
    dayEl.className = "calendar-day";
    if (day.otherMonth) dayEl.classList.add("other-month", "calendar-other-month");
    if (dateStr === today) dayEl.classList.add("today");
    if (absences.length > 0) dayEl.classList.add("has-leave");

    // Group a day's absences by member so a person who is half WFH + half Leave
    // shows as a single split badge instead of two separate badges.
    const byMember = {};
    absences.forEach(a => {
      if (!byMember[a.id]) byMember[a.id] = { name: a.name, hasWFH: false, hasLeave: false, isHalf: false };
      if (a.wfh === "Yes") byMember[a.id].hasWFH = true;
      else byMember[a.id].hasLeave = true;
      if (getLeaveSpan(a) === 0.5) byMember[a.id].isHalf = true;
    });

    let badgesHtml = "";
    Object.values(byMember).forEach(g => {
      const parts = (g.name || "").trim().split(/\s+/).filter(Boolean);
      const label = parts.length > 1 ? `${parts[0]} ${parts[1][0]}` : (parts[0] || g.name);
      let badgeClass = "calendar-badge ";
      if (g.hasWFH && g.hasLeave) badgeClass += "split";
      else badgeClass += g.hasWFH ? "wfh" : "leave";
      // A split badge (half WFH + half Leave) already conveys the half-day nature;
      // for a plain half-day Leave/WFH, render the badge color filled only halfway.
      if (g.isHalf && !(g.hasWFH && g.hasLeave)) badgeClass += " half";
      const titleSuffix = g.isHalf ? " (Half day)" : "";
      badgesHtml += `<div class="${badgeClass}" title="${g.name}${titleSuffix}">${label}</div>`;
    });

    dayEl.innerHTML = `
      <div class="calendar-day-num">${day.date.getDate()}</div>
      <div class="calendar-badges">${badgesHtml}</div>
    `;

    if (!day.otherMonth && absences.length > 0) {
      dayEl.style.cursor = "pointer";
      dayEl.onclick = () => showAbsencesForDate(dateStr);
    }

    container.appendChild(dayEl);
  });
}

function getAbsencesForDate(dateStr) {
  const filtered = activeFilter === "all" ? MEMBERS : MEMBERS.filter(m => m.id === activeFilter);
  const absences = [];

  filtered.forEach(m => {
    const leaves = leaveData[m.id] || [];
    leaves.forEach(l => {
      const start = new Date(l.from);
      const end = new Date(l.to);
      const current = new Date(dateStr);

      if (current >= start && current <= end) {
        absences.push({
          id: m.id,
          name: m.name,
          shortName: getInitials(m.name),
          wfh: l.wfh || "No",
          reason: l.reason || "",
          from: l.from,
          to: l.to,
          duration: l.duration,
          leaveRef: l
        });
      }
    });
  });

  return absences;
}

function showAbsencesForDate(dateStr) {
  window.activeCalendarDate = dateStr;
  const absences = getAbsencesForDate(dateStr);
  const dateObj = new Date(dateStr);
  const dateDisplay = dateObj.toLocaleDateString("en-GB", {day: "2-digit", month: "short", year: "numeric"});

  let html = `<div style="margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--border)">
    <h3 style="font-size:16px;font-weight:600;margin-bottom:0.5rem">${dateDisplay}</h3>
    <p style="font-size:12px;color:var(--muted)">${absences.length} team member${absences.length !== 1 ? "s" : ""} absent</p>
  </div>`;

  if (absences.length === 0) {
    html += `<div class="no-leaves">No absences on this date</div>`;
  } else {
    html += `<div class="leave-list">`;
    absences.forEach(a => {
      const isWFH = a.wfh === "Yes";
      const span = getLeaveSpan(a);
      const halfBubble = span === 0.5 ? `<span class="half-day-bubble ${isWFH ? 'wfh-yes' : 'wfh-no'}">Half Day</span>` : "";
      const reversedLeaves = [...(leaveData[a.id] || [])].reverse();
      const originalIdx = reversedLeaves.indexOf(a.leaveRef);
      html += `
        <div class="leave-row">
          <button class="btn-delete-leave" onclick="deleteLeave('${a.id}', ${originalIdx}, this)" title="Delete record"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
          <div class="leave-row-top">
            <div class="leave-dates">${a.name}</div>
          </div>
          <div class="leave-reason-text">${a.reason || "No reason provided"}</div>
          <div class="leave-label-row">
            <span class="wfh-badge ${isWFH ? 'wfh-yes' : 'wfh-no'}">
              ${isWFH ? '🏠 Work From Home' : '🏢 Leave'}
            </span>
            ${halfBubble}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  document.getElementById("drawerContent").innerHTML = html;
  document.getElementById("drawerOverlay").classList.add("show");
}

function previousMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
  renderCalendar();
}

function nextMonth() {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
  renderCalendar();
}

function currentMonth() {
  currentCalendarDate = new Date();
  renderCalendar();
}

function filterCalendar(memberId) {
  activeFilter = memberId;
  renderCalendar();
}

function onMemberFilterChange(el) {
  filterCalendar(el.value);
}

// Check overlap using single date (from === to)
function isOverlapping(date, existingLeaves) {
  const d = new Date(date);
  return existingLeaves.some(l => {
    const oldStart = new Date(l.from);
    const oldEnd = new Date(l.to);
    return (d >= oldStart && d <= oldEnd);
  });
}

function getWFHValue() {
  const type = document.getElementById("absenceType").value;
  return type === "wfh" ? "Yes" : "No";
}

function selectAbsenceType(type) {
  document.getElementById("absenceType").value = type;
  document.getElementById("leaveBtn").classList.toggle("selected", type === "leave");
  document.getElementById("wfhBtn").classList.toggle("selected", type === "wfh");
}

function selectDuration(value) {
  document.getElementById("durationValue").value = value;
  document.getElementById("fullDayBtn").classList.toggle("selected", value === 1);
  document.getElementById("halfDayBtn").classList.toggle("selected", value === 0.5);
}

function submitLeave() {
  const date = document.getElementById("leaveDate").value;
  const reason = document.getElementById("leaveReason").value;
  const wfh = getWFHValue();
  const duration = parseFloat(document.getElementById("durationValue").value) === 0.5 ? 0.5 : 1;
  const pin = getPin();

  if (!date) { showToast("Please select a date", "error"); return; }

  const leaves = leaveData[currentMemberId] || [];
  if (isOverlapping(date, leaves)) { showToast("A record already exists for this date ❌", "error"); return; }

  const m = MEMBERS.find(x => x.id === currentMemberId);
  if (pin !== m.pin) { document.getElementById("pinError").style.display = "block"; return; }

  const btn = document.getElementById("submitBtn");
  btn.disabled = true;
  btn.textContent = "Submitting...";

  const payload = {
    name: m.name,
    id: m.id,
    from_leave: date,
    end_leave: date,
    reason: reason,
    wfh: wfh === "Yes" ? "Yes" : "No",
    duration: duration
  };

  fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    document.getElementById("formSection").style.display = "none";
    document.getElementById("successSection").style.display = "block";

    const durationText = duration === 0.5 ? "Half day" : "1 day";
    const label = wfh === "Yes"
      ? `Work From Home (${durationText}) on ${formatDate(date)} recorded (not counted as leave).`
      : `${durationText} leave on ${formatDate(date)} recorded.`;

    document.getElementById("successText").textContent = label;
    loadSheetData();
  })
  .catch(() => {
    showToast("Submission failed ❌", "error");
    btn.disabled = false;
    btn.textContent = "Submit Leave Request";
  });
}

// HELPERS
function parseDate(dateStr) {
  const [year, month, day] = dateStr.split("-");
  return new Date(year, parseInt(month) - 1, day);
}

function getDays(f, t) {
  const from = parseDate(f);
  const to = parseDate(t);
  const days = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, days);
}
function getInitials(name) { return name.split(" ").map(n => n[0]).join("").toUpperCase(); }
function getPin() { return ["p1","p2","p3","p4"].map(id => document.getElementById(id).value).join(""); }

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}

function pinNav(el, prevId, nextId) {
  if (el.value && nextId) document.getElementById(nextId).focus();
  if (!el.value && prevId) document.getElementById(prevId).focus();
}

// MODAL
function openModal(id) {
  currentMemberId = id;
  const m = MEMBERS.find(x => x.id === id);
  document.getElementById("modalTitle").textContent = `Apply Leave – ${m.name}`;
  document.getElementById("leaveOverlay").classList.add("show");
}

function closeModal() {
  resetForm();
  document.getElementById("leaveOverlay").classList.remove("show");
  document.getElementById("formSection").style.display = "block";
  document.getElementById("successSection").style.display = "none";
  const btn = document.getElementById("submitBtn");
  btn.disabled = false;
  btn.textContent = "Submit Leave Request";
  currentMemberId = null;
}

function resetForm() {
  document.getElementById("leaveDate").value = "";
  document.getElementById("leaveReason").value = "";
  ["p1","p2","p3","p4"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("pinError").style.display = "none";
  // Reset to Leave
  selectAbsenceType("leave");
  // Reset to Full Day
  selectDuration(1);
}

// Filter leaves by time period
function filterLeavesByPeriod(leaves, period) {
  const today = new Date();
  let startDate, endDate;

  switch(period) {
    case 'month':
      startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'year':
      startDate = new Date(today.getFullYear(), 0, 1);
      endDate = new Date(today.getFullYear(), 11, 31);
      break;
    case 'fiscal':
      if (today.getMonth() >= 9) {
        startDate = new Date(today.getFullYear(), 9, 1);
        endDate = new Date(today.getFullYear() + 1, 8, 31);
      } else {
        startDate = new Date(today.getFullYear() - 1, 9, 1);
        endDate = new Date(today.getFullYear(), 8, 31);
      }
      break;
    default:
      return leaves;
  }

  return leaves.filter(l => {
    const leaveStart = new Date(l.from);
    return leaveStart >= startDate && leaveStart <= endDate;
  });
}

// DRAWER
function openDrawer(id) {
  window.activeCalendarDate = null;
  const m = MEMBERS.find(x => x.id === id);
  const allLeaves = [...leaveData[id]].reverse();
  const total = getActualLeaveDays(leaveData[id]);
  const wfh = getWFHDays(leaveData[id]);
  const period = window.drawerFilterPeriod || 'all';
  const filteredLeaves = period === 'all' ? allLeaves : filterLeavesByPeriod([...leaveData[id]].reverse(), period);

  let html = `
    <div class="drawer-member-info">
      <div class="drawer-avatar" style="background:${m.bg};color:${m.color}">${getInitials(m.name)}</div>
      <div>
        <div class="drawer-name">${m.name}</div>
        <div class="drawer-role">${m.role}</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <span style="font-size:11px;background:#fee2e2;color:#dc2626;padding:3px 8px;border-radius:20px;font-weight:500">${total} PTO</span>
          ${wfh > 0 ? `<span style="font-size:11px;background:rgba(59,130,246,0.15);color:#3b82f6;padding:3px 8px;border-radius:20px;font-weight:500">${wfh} WFH</span>` : ''}
        </div>
      </div>
    </div>
    <button class="btn-leave" style="margin-bottom:1rem" onclick="closeDrawer(); openModal('${m.id}')">Apply</button>

    <div style="display:flex;gap:6px;margin-bottom:1rem;flex-wrap:wrap">
      <button class="filter-btn ${period === 'all' ? 'active' : ''}" onclick="setDrawerFilter('all', '${m.id}')">All</button>
      <button class="filter-btn ${period === 'month' ? 'active' : ''}" onclick="setDrawerFilter('month', '${m.id}')">This Month</button>
      <button class="filter-btn ${period === 'year' ? 'active' : ''}" onclick="setDrawerFilter('year', '${m.id}')">This Year</button>
      <button class="filter-btn ${period === 'fiscal' ? 'active' : ''}" onclick="setDrawerFilter('fiscal', '${m.id}')">Fiscal Year</button>
    </div>
  `;

  if (filteredLeaves.length === 0) {
    html += `<div class="no-leaves">No leave records</div>`;
  } else {
    html += `<div class="leave-list">`;
    filteredLeaves.forEach((l, idx) => {
      const isWFH = (l.wfh || "No") === "Yes";
      const span = getLeaveSpan(l);
      const halfBubble = span === 0.5 ? `<span class="half-day-bubble ${isWFH ? 'wfh-yes' : 'wfh-no'}">Half Day</span>` : "";

      const originalIdx = allLeaves.indexOf(l);

      html += `
        <div class="leave-row">
          <button class="btn-delete-leave" onclick="deleteLeave('${m.id}', ${originalIdx}, this)" title="Delete record"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
          <div class="leave-row-top">
            <div class="leave-dates">${formatDate(l.from)}</div>
          </div>
          <div class="leave-reason-text">${l.reason || "No reason provided"}</div>
          <div class="leave-label-row">
            <span class="wfh-badge ${isWFH ? 'wfh-yes' : 'wfh-no'}">
              ${isWFH ? '🏠 Work From Home' : '🏢 Leave'}
            </span>
            ${halfBubble}
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  document.getElementById("drawerContent").innerHTML = html;
  document.getElementById("drawerOverlay").classList.add("show");
}

function setDrawerFilter(period, memberId) {
  window.drawerFilterPeriod = period;
  openDrawer(memberId);
}

function setCardFilter(period) {
  window.cardFilterPeriod = period;
  updateOverviewMemberCards();
  // Update active state for filter buttons
  document.querySelectorAll(".stat-card .filter-btn").forEach(btn => {
    const btnText = btn.textContent.toLowerCase();
    const isActive =
      (period === 'all' && btnText === 'all') ||
      (period === 'month' && btnText.includes('month')) ||
      (period === 'year' && btnText === 'this year') ||
      (period === 'fiscal' && btnText.includes('fiscal'));
    btn.classList.toggle("active", isActive);
  });
}

function closeDrawer() { document.getElementById("drawerOverlay").classList.remove("show"); }

function deleteLeave(memberId, leaveIndex, btn) {
  const leaves = leaveData[memberId] || [];
  const reversedLeaves = [...leaves].reverse();
  const leave = reversedLeaves[leaveIndex];
  const member = MEMBERS.find(m => m.id === memberId);

  if (!leave || !member) return;

  // Show PIN confirmation modal
  document.getElementById("deletePinInput").value = "";
  document.getElementById("deletePinError").style.display = "none";
  document.getElementById("deleteConfirmModal").style.display = "flex";
  document.getElementById("deleteLeaveTitle").textContent = `Delete Leave Record - ${member.name}`;

  // Store context for confirmation
  window.deleteContext = { memberId, leaveIndex, leave, member };

  // Focus on PIN input
  document.getElementById("deletePinInput").focus();
}

function confirmDeleteWithPin() {
  if (!window.deleteContext) return;

  const enteredPin = document.getElementById("deletePinInput").value;
  const { memberId, leave, member } = window.deleteContext;

  if (enteredPin !== member.pin) {
    document.getElementById("deletePinError").style.display = "block";
    document.getElementById("deletePinInput").value = "";
    return;
  }

  // PIN is correct, proceed with deletion
  const leaves = leaveData[memberId] || [];
  const payload = {
    action: "deleteLeave",
    id: memberId,
    name: member.name,
    from_leave: leave.from,
    end_leave: leave.to,
    wfh: leave.wfh
  };

  fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    // Remove the exact record by reference (robust against duplicate rows).
    leaveData[memberId] = leaves.filter(l => l !== leave);
    showToast("Leave record deleted successfully");
    closeDeleteConfirmModal();
    const calDate = window.activeCalendarDate;
    if (calDate) {
      renderCalendar();
      showAbsencesForDate(calDate);
    } else {
      openDrawer(memberId);
    }
    loadSheetData();
  })
  .catch(() => {
    showToast("Failed to delete record ❌", "error");
    closeDeleteConfirmModal();
  });
}

function closeDeleteConfirmModal() {
  document.getElementById("deleteConfirmModal").style.display = "none";
  document.getElementById("deletePinInput").value = "";
  document.getElementById("deletePinError").style.display = "none";
  window.deleteContext = null;
}

function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast show" + (type === "error" ? " error" : "");
  setTimeout(() => t.className = "toast", 3000);
}

// MEMBER MANAGEMENT
async function loadMembers() {
  try {
    const res = await fetch(API_URL + "?action=getMembers");
    const json = await res.json();
    console.log("Members API response:", json);

    if (json.status === "success" && json.data && Array.isArray(json.data)) {
      MEMBERS = json.data;
      console.log("Loaded members from sheet:", MEMBERS);
    } else {
      console.log("No members from sheet, using default (empty)");
      MEMBERS = [...DEFAULT_MEMBERS];
    }
  } catch (err) {
    console.error("Error loading members from sheet:", err);
    MEMBERS = [...DEFAULT_MEMBERS];
  }
  console.log("Final MEMBERS array:", MEMBERS);
}

function initColorPicker() {
  const picker = document.getElementById("colorPicker");
  picker.innerHTML = COLOR_PALETTE.map((c, i) => `
    <div class="color-option ${i === 0 ? 'selected' : ''}"
         onclick="selectColor(${i})"
         style="background: linear-gradient(135deg, ${c.bg}, ${c.color});"
         data-bg="${c.bg}" data-color="${c.color}"></div>
  `).join("");
}

function selectColor(index) {
  selectedColorIndex = index;
  document.querySelectorAll(".color-option").forEach((el, i) => {
    el.classList.toggle("selected", i === index);
  });
}

function openAddMemberModal() {
  document.getElementById("memberName").value = "";
  document.getElementById("memberId").value = "";
  document.getElementById("memberRole").value = "";
  document.getElementById("memberPin").value = "";
  selectedColorIndex = 0;
  initColorPicker();
  document.getElementById("addMemberOverlay").classList.add("show");
}

function closeAddMemberModal() {
  document.getElementById("addMemberOverlay").classList.remove("show");
}

function saveMember() {
  const name = document.getElementById("memberName").value.trim();
  const id = document.getElementById("memberId").value.trim().toUpperCase();
  const role = document.getElementById("memberRole").value.trim();
  const pin = document.getElementById("memberPin").value.trim();
  const {bg, color} = COLOR_PALETTE[selectedColorIndex];

  if (!name || !id || !role || !pin) {
    showToast("Please fill all fields", "error");
    return;
  }

  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    showToast("PIN must be 4 digits", "error");
    return;
  }

  if (MEMBERS.some(m => m.id === id)) {
    showToast("Member ID already exists", "error");
    return;
  }

  const payload = {
    action: "addMember",
    id, name, role, pin, bg, color
  };

  fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    closeAddMemberModal();
    showToast(`${name} added successfully!`);
    loadMembers().then(() => {
      buildNav();
      init();
    });
  })
  .catch(() => {
    showToast("Failed to add member ❌", "error");
  });
}

function deleteMember(id) {
  if (!confirm("Are you sure you want to delete this member?")) return;

  const payload = {
    action: "deleteMember",
    id: id
  };

  fetch(API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  })
  .then(() => {
    MEMBERS = MEMBERS.filter(m => m.id !== id);
    delete leaveData[id];
    showToast("Member deleted");
    buildNav();
    init();
  })
  .catch(() => {
    showToast("Failed to delete member ❌", "error");
  });
}

// VIEW SWITCHING
function switchView(view, el) {
  currentView = view;
  const overviewView = document.getElementById("overviewView");
  const calendarView = document.getElementById("calendarView");
  const summaryView = document.getElementById("summaryView");
  const assessmentView = document.getElementById("assessmentView");
  const filterContainer = document.getElementById("memberFilterContainer");
  const pageHeader = document.querySelector(".page-header");

  overviewView.style.display = "none";
  calendarView.style.display = "none";
  summaryView.style.display = "none";
  assessmentView.style.display = "none";
  pageHeader.style.display = "none";

  if (view === "overview") {
    overviewView.style.display = "block";
  } else if (view === "calendar") {
    calendarView.style.display = "block";
    pageHeader.style.display = "flex";
  } else if (view === "summary") {
    summaryView.style.display = "block";
    updateSummary();
  } else if (view === "assessment") {
    assessmentView.style.display = "block";
    if (!window._saBuilt) { saBuildForm(); window._saBuilt = true; }
  }

  // Remove active class from all top-level nav items
  document.querySelectorAll("#navBar > .nav-item").forEach(n => n.classList.remove("active"));
  if (el) el.classList.add("active");
}

function getFiscalYearRange() {
  const today = new Date();
  let fiscalStart, fiscalEnd;

  if (today.getMonth() >= 9) {
    // Oct-Dec: fiscal year is Oct (current year) to Sep (next year)
    fiscalStart = new Date(today.getFullYear(), 9, 1);
    fiscalEnd = new Date(today.getFullYear() + 1, 8, 30);
  } else {
    // Jan-Sep: fiscal year is Oct (previous year) to Sep (current year)
    fiscalStart = new Date(today.getFullYear() - 1, 9, 1);
    fiscalEnd = new Date(today.getFullYear(), 8, 30);
  }

  return { fiscalStart, fiscalEnd };
}

function initSummaryDates() {
  // Default the Summary page to the current fiscal year
  const { fiscalStart, fiscalEnd } = getFiscalYearRange();
  document.getElementById("summaryStartDate").valueAsDate = fiscalStart;
  document.getElementById("summaryEndDate").valueAsDate = fiscalEnd;
}

function setFiscalYear() {
  const { fiscalStart, fiscalEnd } = getFiscalYearRange();
  document.getElementById("summaryStartDate").valueAsDate = fiscalStart;
  document.getElementById("summaryEndDate").valueAsDate = fiscalEnd;
  updateSummary();
}

function setCalendarYear() {
  const today = new Date();
  const calendarStart = new Date(today.getFullYear(), 0, 1);
  const calendarEnd = new Date(today.getFullYear(), 11, 31);

  document.getElementById("summaryStartDate").valueAsDate = calendarStart;
  document.getElementById("summaryEndDate").valueAsDate = calendarEnd;
  updateSummary();
}

function updateSummary() {
  const startStr = document.getElementById("summaryStartDate").value;
  const endStr = document.getElementById("summaryEndDate").value;

  if (!startStr || !endStr) {
    showToast("Please select both dates", "error");
    return;
  }

  const startDate = parseDate(startStr);
  const endDate = parseDate(endStr);

  if (startDate > endDate) {
    showToast("Start date must be before end date", "error");
    return;
  }

  const summaryData = calculateSummary(startDate, endDate);
  renderSummaryStats(summaryData);
  renderSummaryTable(summaryData);
}

function calculateSummary(startDate, endDate) {
  const summary = {
    totalLeaveDays: 0,
    totalWFHDays: 0,
    members: []
  };

  MEMBERS.forEach(m => {
    const leaves = leaveData[m.id] || [];
    let memberLeaveDays = 0;
    let memberWFHDays = 0;

    leaves.forEach(l => {
      const leaveStart = parseDate(l.from);
      const leaveEnd = parseDate(l.to);

      if (leaveEnd >= startDate && leaveStart <= endDate) {
        const overlapStart = leaveStart >= startDate ? leaveStart : startDate;
        const overlapEnd = leaveEnd <= endDate ? leaveEnd : endDate;

        const startStr = overlapStart.getFullYear() + "-" + String(overlapStart.getMonth() + 1).padStart(2, "0") + "-" + String(overlapStart.getDate()).padStart(2, "0");
        const endStr = overlapEnd.getFullYear() + "-" + String(overlapEnd.getMonth() + 1).padStart(2, "0") + "-" + String(overlapEnd.getDate()).padStart(2, "0");
        let daysInRange = getDays(startStr, endStr);
        // Half-day applies to single-day records counted in full within the range
        if (getDays(l.from, l.to) === 1 && parseFloat(l.duration) === 0.5) {
          daysInRange = 0.5;
        }

        if (l.wfh === "Yes") {
          memberWFHDays += daysInRange;
          summary.totalWFHDays += daysInRange;
        } else {
          memberLeaveDays += daysInRange;
          summary.totalLeaveDays += daysInRange;
        }
      }
    });

    if (memberLeaveDays > 0 || memberWFHDays > 0) {
      summary.members.push({
        id: m.id,
        name: m.name,
        leaveDays: memberLeaveDays,
        wfhDays: memberWFHDays,
        totalDays: memberLeaveDays + memberWFHDays
      });
    }
  });

  return summary;
}

function renderSummaryStats(summaryData) {
  document.getElementById("totalLeaveDays").textContent = summaryData.totalLeaveDays;
  document.getElementById("totalWFHDays").textContent = summaryData.totalWFHDays;
  document.getElementById("totalMembers").textContent = summaryData.members.length;
}

function renderSummaryTable(summaryData) {
  const tbody = document.getElementById("summaryTableBody");

  if (summaryData.members.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="no-data-msg">No absences found in the selected date range</td></tr>`;
    return;
  }

  tbody.innerHTML = summaryData.members.map(m => `
    <tr>
      <td><strong>${m.name}</strong></td>
      <td>${m.id}</td>
      <td><span class="leave-count-badge">${m.leaveDays}</span></td>
      <td><span class="wfh-count">${m.wfhDays}</span></td>
      <td>${m.totalDays} day(s)</td>
    </tr>
  `).join("");
}

function downloadSummaryPDF() {
  const startStr = document.getElementById("summaryStartDate").value;
  const endStr = document.getElementById("summaryEndDate").value;

  if (!startStr || !endStr) {
    showToast("Please select both start and end dates", "error");
    return;
  }

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  const summaryData = calculateSummary(startDate, endDate);

  // Create PDF content
  const element = document.createElement("div");
  element.style.padding = "20px";
  element.style.fontFamily = "Arial, sans-serif";
  element.style.fontSize = "12px";

  const header = `
    <div style="text-align:center;margin-bottom:30px;">
      <h1 style="margin:0 0 5px 0;font-size:24px;">BW DESIGN GROUP</h1>
      <h2 style="margin:0 0 15px 0;font-size:14px;color:#666;">Leave Report</h2>
      <p style="margin:0;color:#999;">Period: ${formatDate(startStr)} to ${formatDate(endStr)}</p>
    </div>
  `;

  const stats = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;margin-bottom:30px;">
      <div style="border:1px solid #ddd;padding:15px;text-align:center;border-radius:4px;">
        <div style="font-size:28px;font-weight:bold;color:#2563eb;">${summaryData.totalLeaveDays}</div>
        <div style="color:#666;margin-top:5px;">Total Leave Days</div>
      </div>
      <div style="border:1px solid #ddd;padding:15px;text-align:center;border-radius:4px;">
        <div style="font-size:28px;font-weight:bold;color:#059669;">${summaryData.totalWFHDays}</div>
        <div style="color:#666;margin-top:5px;">Total WFH Days</div>
      </div>
      <div style="border:1px solid #ddd;padding:15px;text-align:center;border-radius:4px;">
        <div style="font-size:28px;font-weight:bold;color:#6366f1;">${summaryData.members.length}</div>
        <div style="color:#666;margin-top:5px;">Team Members</div>
      </div>
    </div>
  `;

  let tableHtml = `
    <table style="width:100%;border-collapse:collapse;margin-top:20px;">
      <thead>
        <tr style="background-color:#f3f4f6;border-bottom:2px solid #ddd;">
          <th style="padding:12px;text-align:left;border:1px solid #ddd;font-weight:bold;">Professional Name</th>
          <th style="padding:12px;text-align:left;border:1px solid #ddd;font-weight:bold;">Professional ID</th>
          <th style="padding:12px;text-align:center;border:1px solid #ddd;font-weight:bold;">Leave Days</th>
          <th style="padding:12px;text-align:center;border:1px solid #ddd;font-weight:bold;">WFH Days</th>
          <th style="padding:12px;text-align:center;border:1px solid #ddd;font-weight:bold;">Total Absences</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (summaryData.members.length === 0) {
    tableHtml += `<tr><td colspan="5" style="padding:12px;text-align:center;color:#999;border:1px solid #ddd;">No absences found in the selected date range</td></tr>`;
  } else {
    summaryData.members.forEach(m => {
      tableHtml += `
        <tr style="border-bottom:1px solid #ddd;">
          <td style="padding:12px;border:1px solid #ddd;">${m.name}</td>
          <td style="padding:12px;border:1px solid #ddd;">${m.id}</td>
          <td style="padding:12px;border:1px solid #ddd;text-align:center;">${m.leaveDays}</td>
          <td style="padding:12px;border:1px solid #ddd;text-align:center;">${m.wfhDays}</td>
          <td style="padding:12px;border:1px solid #ddd;text-align:center;">${m.totalDays}</td>
        </tr>
      `;
    });
  }

  tableHtml += `
      </tbody>
    </table>
  `;

  const footer = `
    <div style="margin-top:40px;border-top:1px solid #ddd;padding-top:20px;color:#999;font-size:10px;text-align:center;">
      <p>Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
    </div>
  `;

  element.innerHTML = header + stats + tableHtml + footer;

  // Generate PDF
  const opt = {
    margin: 10,
    filename: `leave-report-${startStr}-to-${endStr}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { orientation: 'portrait', unit: 'mm', format: 'a4' }
  };

  html2pdf().set(opt).from(element).save();
}

function toggleDropdownMenu(e, menuId) {
  e.stopPropagation();
  const menu = document.getElementById(menuId);
  // Close any other open dropdown menus first.
  document.querySelectorAll(".download-menu.show").forEach(m => {
    if (m !== menu) m.classList.remove("show");
  });
  const isOpen = menu.classList.toggle("show");
  // Close on the next outside click while the menu is open.
  if (isOpen) {
    document.addEventListener("click", () => closeDropdownMenu(menuId), { once: true });
  }
}

function closeDropdownMenu(menuId) {
  document.getElementById(menuId).classList.remove("show");
}

function downloadSummaryExcel() {
  const startStr = document.getElementById("summaryStartDate").value;
  const endStr = document.getElementById("summaryEndDate").value;

  if (!startStr || !endStr) {
    showToast("Please select both start and end dates", "error");
    return;
  }

  if (typeof XLSX === "undefined") {
    showToast("Excel library not loaded", "error");
    return;
  }

  const summaryData = calculateSummary(new Date(startStr), new Date(endStr));

  // Build worksheet rows: title block, totals, then the per-member table.
  const rows = [
    ["BW DESIGN GROUP – Leave Report"],
    [`Period: ${formatDate(startStr)} to ${formatDate(endStr)}`],
    [],
    ["Total PTO Days", summaryData.totalLeaveDays],
    ["Total WFH Days", summaryData.totalWFHDays],
    ["Team Members", summaryData.members.length],
    [],
    ["Professional Name", "Professional ID", "PTO Days", "WFH Days", "Total Absences"]
  ];

  if (summaryData.members.length === 0) {
    rows.push(["No absences found in the selected date range"]);
  } else {
    summaryData.members.forEach(m => {
      rows.push([m.name, m.id, m.leaveDays, m.wfhDays, m.totalDays]);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leave Report");
  XLSX.writeFile(wb, `leave-report-${startStr}-to-${endStr}.xlsx`);
}

// ── SKILL ASSESSMENT ────────────────────────────────────────────────────────


const SA_DOMAINS = [
  { title: "IGNITION PLATFORM", skills: [
    { id:"ign1", name:"Ignition Designer fundamentals", desc:"UDTs, tag browser, project structure, basic navigation" },
    { id:"ign2", name:"Perspective components & views", desc:"Binding, flex layout, component config, responsive design" },
    { id:"ign3", name:"Vision (legacy) screens", desc:"Window design, templates, popup management" },
    { id:"ign4", name:"Named queries & database connectivity", desc:"Writing named queries, parameterised queries, DB connections" },
    { id:"ign5", name:"Tag historian & reporting", desc:"Historian config, SQL Bridge, report module" },
    { id:"ign6", name:"Alarm management", desc:"Alarm config, shelving, pipelines, journal queries" },
    { id:"ign7", name:"Transaction groups & OPC tags", desc:"OPC-UA browsing, tag imports, transaction groups" },
    { id:"ign8", name:"Gateway config & architecture", desc:"Gateway network, redundancy, module management" },
  ]},
  { title: "PYTHON SCRIPTING", skills: [
    { id:"py1", name:"Python basics", desc:"Variables, loops, conditionals, functions, data types" },
    { id:"py2", name:"Ignition scripting (Jython)", desc:"Event scripts, gateway scripts, system.* API functions" },
    { id:"py3", name:"File / data handling", desc:"CSV, JSON parsing, file I/O, datetime manipulation" },
    { id:"py4", name:"REST API calls from Python", desc:"requests library, JSON handling, authentication headers" },
    { id:"py5", name:"Pandas / data manipulation", desc:"DataFrames, filtering, aggregation, merge operations" },
    { id:"py6", name:"Scheduled scripts & automation", desc:"Cron-like tasks, gateway timer scripts, error handling" },
  ]},
  { title: "GIT & GITHUB", skills: [
    { id:"git1", name:"Core Git commands", desc:"clone, add, commit, push, pull, status, log" },
    { id:"git2", name:"Branching & merging", desc:"Creating branches, merge, rebase basics, resolving conflicts" },
    { id:"git3", name:"Pull requests & code review", desc:"Raising PRs, reviewing, commenting, approving" },
    { id:"git4", name:"GitHub Actions / CI basics", desc:"Understanding pipelines, reading workflow YAML, triggering runs" },
    { id:"git5", name:"Git for Ignition projects", desc:"Exporting Ignition projects to Git, diff strategies" },
  ]},
  { title: "DATABASE", skills: [
    { id:"db1", name:"SQL fundamentals", desc:"SELECT, WHERE, JOIN, GROUP BY, basic CRUD" },
    { id:"db2", name:"Stored procedures & views", desc:"Writing/calling stored procs, creating views" },
    { id:"db3", name:"Database design", desc:"Schema design, normalisation, indexing basics" },
    { id:"db4", name:"PostgreSQL / MySQL / MSSQL admin", desc:"User management, backups, performance basics" },
    { id:"db5", name:"Time-series data handling", desc:"Historian queries, downsampling, trend data optimisation" },
  ]},
  { title: "UI / UX & FIGMA", skills: [
    { id:"ux1", name:"Figma basics", desc:"Frames, components, constraints, auto-layout" },
    { id:"ux2", name:"HMI / SCADA screen mockups", desc:"Wireframing process screens, navigation flows in Figma" },
    { id:"ux3", name:"HMI design standards", desc:"ISA-101 awareness, colour standards, alarm state colours" },
    { id:"ux4", name:"Responsive / multi-screen design", desc:"Designing for different panel sizes, mobile Perspective" },
  ]},
  { title: "MES & INTEGRATION", skills: [
    { id:"mes1", name:"MES concepts & workflows", desc:"Work orders, production tracking, genealogy, OEE basics" },
    { id:"mes2", name:"OPC-UA integration", desc:"Server/client config, browsing nodes, security certificates" },
    { id:"mes3", name:"REST API design & consumption", desc:"Building or consuming REST endpoints, Postman, swagger" },
    { id:"mes4", name:"ERP/MES–SCADA data flows", desc:"Understanding data handoff between SCADA and business systems" },
  ]},
  { title: "INFRASTRUCTURE & DEVOPS", skills: [
    { id:"inf1", name:"Docker fundamentals", desc:"docker run, pull, images, containers, basic docker-compose" },
    { id:"inf2", name:"Writing Dockerfiles", desc:"Building custom images, layers, environment variables" },
    { id:"inf3", name:"Docker Compose", desc:"Multi-service compose files, networking, volumes" },
    { id:"inf4", name:"Kubernetes basics", desc:"Pods, deployments, services — reading/understanding manifests" },
    { id:"inf5", name:"Linux command line", desc:"Navigation, permissions, systemctl, journalctl, networking tools" },
    { id:"inf6", name:"Ignition on Docker / K8s", desc:"Deploying Ignition gateway in containers, persistence, config" },
  ]},
];

let saRatings = {};
let saEvidence = {};
const saTotalSkills = SA_DOMAINS.reduce((a, d) => a + d.skills.length, 0);

function saUpdateProgress() {
  const rated = Object.keys(saRatings).length;
  const pct = Math.round(rated / saTotalSkills * 100);
  document.getElementById('sa-rated').textContent = rated;
  document.getElementById('sa-total').textContent = saTotalSkills;
  document.getElementById('sa-pct').textContent = pct + '%';
}

function saSetRating(id, val) {
  saRatings[id] = val;
  document.querySelectorAll(`.sa-rb[data-id="${id}"]`).forEach(b => {
    const bv = parseInt(b.dataset.val);
    b.className = 'sa-rb' + (bv === val ? ` sa-s${val}` : '');
  });
  saUpdateProgress();
}

function saPopulateNames() {
  const select = document.getElementById('sa-name');
  if (!select) return;
  select.innerHTML = `<option value="">Select...</option>`;
  MEMBERS.forEach(m => {
    const option = document.createElement('option');
    option.value = m.name;
    option.textContent = m.name;
    select.appendChild(option);
  });
}

function saBuildForm() {
  saPopulateNames();
  const body = document.getElementById('assessmentFormBody');
  SA_DOMAINS.forEach(domain => {
    const block = document.createElement('div');
    block.className = 'sa-domain-block';

    const hdr = document.createElement('div');
    hdr.className = 'sa-domain-header';
    hdr.innerHTML = `<span>${domain.title}</span>`;
    block.appendChild(hdr);

    domain.skills.forEach(skill => {
      const row = document.createElement('div');
      row.className = 'sa-skill-row';
      row.dataset.skillId = skill.id;
      row.innerHTML = `
        <div>
          <div class="sa-skill-name">${skill.name}</div>
          <div class="sa-skill-desc">${skill.desc}</div>
        </div>
        <div class="sa-rating-group">
          ${[0,1,2,3,4].map(v => `<button class="sa-rb" data-id="${skill.id}" data-val="${v}" onclick="saSetRating('${skill.id}',${v})">${v}</button>`).join('')}
        </div>
        <div class="sa-skill-evidence">
          <input type="text" placeholder="Where have you used this? (optional)" oninput="saEvidence['${skill.id}']=this.value">
        </div>`;
      block.appendChild(row);
    });

    body.appendChild(block);
  });
  saUpdateProgress();
}

function saScrollToFirst() {
  const allIds = SA_DOMAINS.flatMap(d => d.skills.map(s => s.id));
  const firstUnrated = allIds.find(id => saRatings[id] === undefined);
  if (!firstUnrated) { showToast('All skills rated!', 'success'); return; }
  const el = document.querySelector(`.sa-skill-row[data-skill-id="${firstUnrated}"]`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function saSubmitForm() {
  const name = document.getElementById('sa-name').value.trim();
  if (!name) { showToast('Please enter your name before submitting.', 'error'); return; }

  const btn = document.getElementById('sa-submit-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  const row = {
    action: "skillAssessment",
    name,
    background: document.getElementById('sa-bg').value || '—',
    experience: document.getElementById('sa-exp').value || '—',
    submitted_at: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
  };

  SA_DOMAINS.forEach(domain => {
    domain.skills.forEach(skill => {
      row[skill.id + '_rating'] = saRatings[skill.id] !== undefined ? saRatings[skill.id] : '—';
      row[skill.id + '_evidence'] = saEvidence[skill.id] || '';
    });
  });

  try {
    await fetch(API_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row),
    });
    btn.textContent = '✓ Submitted';
    btn.style.background = '#059669';
    showToast(`Thanks ${name}! Your assessment has been submitted.`, 'success');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Submit Assessment';
    showToast('Submission failed. Please check your connection and try again.', 'error');
  }
}

setInterval(loadSheetData, 30000);

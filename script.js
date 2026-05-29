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

document.addEventListener("DOMContentLoaded", async function() {
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
            wfh: (row.wfh || "No").toString()
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
  }
}

// Count only non-WFH entries as leave days
function getActualLeaveDays(leaves) {
  return leaves
    .filter(l => (l.wfh || "No") !== "Yes")
    .reduce((a, l) => a + getDays(l.from, l.to), 0);
}

// Count only WFH entries
function getWFHDays(leaves) {
  return leaves
    .filter(l => (l.wfh || "No") === "Yes")
    .reduce((a, l) => a + getDays(l.from, l.to), 0);
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
        totalLeaveDaysMonth += getDays(
          overlapStart.toISOString().split("T")[0],
          overlapEnd.toISOString().split("T")[0]
        );
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

  const activeToday = MEMBERS.length - document.querySelectorAll("#overviewTodayStatus [style*='dc2626']").length;
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
          <span><strong style="color:var(--accent)">${total}</strong> days leave</span>
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

    let badgesHtml = "";
    absences.forEach(a => {
      const badgeType = a.wfh === "Yes" ? "wfh" : "leave";
      badgesHtml += `<div class="calendar-badge ${badgeType}" title="${a.name}">${a.shortName}</div>`;
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
          to: l.to
        });
      }
    });
  });

  return absences;
}

function showAbsencesForDate(dateStr) {
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
      const member = MEMBERS.find(m => m.id === a.id);
      const isWFH = a.wfh === "Yes";
      html += `
        <div class="leave-row">
          <div class="leave-row-top">
            <div class="leave-dates">${a.name}</div>
            <div class="leave-days" style="${isWFH ? "background:#dcfce7;color:#15803d" : "background:#fef3c7;color:#b45309"}">
              ${isWFH ? "WFH" : "Leave"}
            </div>
          </div>
          <div class="leave-reason-text">${a.reason || "No reason provided"}</div>
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

function submitLeave() {
  const date = document.getElementById("leaveDate").value;
  const reason = document.getElementById("leaveReason").value;
  const wfh = getWFHValue();
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
    wfh: wfh === "Yes" ? "Yes" : "No"
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

    const label = wfh === "Yes"
      ? `Work From Home on ${formatDate(date)} recorded (not counted as leave).`
      : `1 day leave on ${formatDate(date)} recorded.`;

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
function getDays(f, t) { return (new Date(t) - new Date(f)) / (1000 * 60 * 60 * 24) + 1; }
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
          <span style="font-size:11px;background:#fef3c7;color:#b45309;padding:3px 8px;border-radius:20px;font-weight:500">${total} Leave</span>
          ${wfh > 0 ? `<span style="font-size:11px;background:#dcfce7;color:#15803d;padding:3px 8px;border-radius:20px;font-weight:500">${wfh} WFH</span>` : ''}
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
      const daysLabel = isWFH
        ? `<div class="leave-days" style="background:#dcfce7;color:#15803d">WFH</div>`
        : `<div class="leave-days">${getDays(l.from, l.to)} day(s)</div>`;

      const originalIdx = allLeaves.indexOf(l);

      html += `
        <div class="leave-row">
          <button class="btn-delete-leave" onclick="deleteLeave('${m.id}', ${originalIdx}, this)" title="Delete record">Delete</button>
          <div class="leave-row-top">
            <div class="leave-dates">${formatDate(l.from)}</div>
            ${daysLabel}
          </div>
          <div class="leave-reason-text">${l.reason || "No reason provided"}</div>
          <span class="wfh-badge ${isWFH ? 'wfh-yes' : 'wfh-no'}">
            ${isWFH ? '🏠 Work From Home' : '🏢 Leave'}
          </span>
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
  const { memberId, leaveIndex, leave, member } = window.deleteContext;

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
    leaveData[memberId] = leaves.filter((l, idx) => {
      const originalIndex = leaves.length - 1 - idx;
      const reversedIndex = leaveIndex;
      return originalIndex !== reversedIndex;
    });
    showToast("Leave record deleted successfully");
    closeDeleteConfirmModal();
    openDrawer(memberId);
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
  const filterContainer = document.getElementById("memberFilterContainer");
  const pageHeader = document.querySelector(".page-header");

  overviewView.style.display = "none";
  calendarView.style.display = "none";
  summaryView.style.display = "none";
  pageHeader.style.display = "none";

  if (view === "overview") {
    overviewView.style.display = "block";
  } else if (view === "calendar") {
    calendarView.style.display = "block";
    pageHeader.style.display = "flex";
  } else if (view === "summary") {
    summaryView.style.display = "block";
  }

  // Remove active class from all top-level nav items
  document.querySelectorAll("#navBar > .nav-item").forEach(n => n.classList.remove("active"));
  if (el) el.classList.add("active");
}

function initSummaryDates() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  document.getElementById("summaryStartDate").valueAsDate = firstDay;
  document.getElementById("summaryEndDate").valueAsDate = lastDay;
}

function setFiscalYear() {
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

  const startDate = new Date(startStr);
  const endDate = new Date(endStr);

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
      const leaveStart = new Date(l.from);
      const leaveEnd = new Date(l.to);

      if (leaveEnd >= startDate && leaveStart <= endDate) {
        const overlapStart = new Date(Math.max(leaveStart.getTime(), startDate.getTime()));
        const overlapEnd = new Date(Math.min(leaveEnd.getTime(), endDate.getTime()));
        const daysInRange = getDays(overlapStart.toISOString().split("T")[0], overlapEnd.toISOString().split("T")[0]);

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

setInterval(loadSheetData, 30000);

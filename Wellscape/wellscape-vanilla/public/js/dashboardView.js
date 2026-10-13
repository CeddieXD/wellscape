// Dashboard / analytics view — ported from WellscapeUI index.html + script.js.
// Renders a full-page wellness dashboard with sidebar navigation, wellness score,
// mood charts, habit progress, recent check-ins, and an "Enter Plaza" button.

const MOODS = [
  { score: 1, label: "Very low", emoji: "😢", color: "#d98e91" },
  { score: 2, label: "Low",      emoji: "😕", color: "#e9ad8c" },
  { score: 3, label: "Okay",     emoji: "😐", color: "#f0cf83" },
  { score: 4, label: "Good",     emoji: "🙂", color: "#9bb69a" },
  { score: 5, label: "Great",    emoji: "😄", color: "#315c49" },
];

// Sidebar nav items (section name → icon SVG path content)
const NAV_ITEMS = [
  { id: "overview",   label: "Overview",      icon: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>' },
  { id: "journal",    label: "Daily Journal",  icon: '<path d="M6 4.5h12a1 1 0 0 1 1 1v14H7a2 2 0 0 1-2-2v-12a1 1 0 0 1 1-1Z"/><path d="M8 9h7M8 13h7M8 17h4"/><path d="M5 17a2 2 0 0 1 2-2"/>' },
  { id: "analytics",  label: "Analytics",     icon: '<path d="M4 19.5h16M5 17V5"/><path d="m7.5 14 3.2-3.2 3 1.7 4.8-6"/><circle cx="18.5" cy="6.5" r="1"/>', active: true },
  { id: "goals",      label: "My Goals",      icon: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>' },
];

function navIcon(paths) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
function dateDaysAgo(date, n) {
  const d = new Date(date); d.setDate(d.getDate() - n); return d;
}
function formatDate(date, opts = { month: "short", day: "numeric" }) {
  return new Intl.DateTimeFormat("en", opts).format(date);
}
function avg(records, key) {
  if (!records.length) return null;
  return records.reduce((s, r) => s + r[key], 0) / records.length;
}
function fmt(v, dec = 1) {
  return v === null ? "—" : v.toFixed(dec).replace(/\.0$/, "");
}
function wellnessScore(records) {
  if (!records.length) return null;
  return Math.round(
    ((avg(records, "mood") / 5) +
     Math.min(avg(records, "sleep") / 8, 1) +
     Math.min(avg(records, "water") / 8, 1) +
     Math.min(avg(records, "activity") / 30, 1)) * 25
  );
}

/**
 * @param {object} opts
 * @param {object} opts.user           current user { id, name, email }
 * @param {() => void} opts.onEnterPlaza
 * @param {() => void} opts.onCheckin
 * @param {(section:string) => void} opts.onNav
 * @returns {{ el: HTMLElement, destroy: () => void }}
 */
export function DashboardView({ user, onEnterPlaza, onCheckin, onNav, onLogout }) {
  const referenceDate = startOfDay(new Date());
  let wellnessData = [];
  let moodTrendChart, moodBalanceChart, wsChart;
  let toastTimeout;

  // ── Build the DOM ────────────────────────────────────────────────────────
  const root = document.createElement("div");
  root.className = "ws-app view-enter";

  const avatarLetter = (user?.name?.[0] ?? "W").toUpperCase();
  const firstName    = user?.name?.split(" ")[0] ?? "there";

  root.innerHTML = `
    <aside class="ws-sidebar" aria-label="Main navigation">
      <a class="ws-brand" href="#" aria-label="Wellscape overview">
        <span class="ws-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5">
            <path d="M16 25V12m0 8c-6 0-9-4-9-10 6 0 9 3 9 8m0-3c0-6 4-9 10-9 0 6-3 10-10 10"/>
            <path d="M9 25h14"/>
          </svg>
        </span>
        <span>wellscape</span>
      </a>

      <span class="ws-nav-caption">YOUR SPACE</span>
      <nav class="ws-primary-nav" aria-label="Main sections">
        ${NAV_ITEMS.map(n => `
          <a class="ws-nav-link${n.active ? " is-active" : ""}" href="#${n.id}" data-section="${n.id}" ${n.active ? 'aria-current="page"' : ""}>
            <span class="ws-nav-icon" aria-hidden="true">${navIcon(n.icon)}</span>
            <span>${n.label}</span>
          </a>`).join("")}
      </nav>

      <div class="ws-sidebar-bottom">
        <button type="button" class="ws-plaza-btn" id="enter-plaza-btn">
          <span class="ws-plaza-icon">🎮</span>
          <span>Enter the Plaza</span>
        </button>
        <div class="ws-reminder-card">
          <span class="ws-reminder-spark" aria-hidden="true">✳</span>
          <p>Take a breath.<br><em>You're right where you need to be.</em></p>
        </div>
        <div class="ws-profile-mini">
          <span class="ws-avatar" aria-hidden="true">${avatarLetter}</span>
          <span class="ws-profile-copy"><strong>${user?.name ?? "Your space"}</strong><small>${user?.email ?? "Personal journal"}</small></span>
          <button type="button" class="ws-logout-btn" title="Sign out" aria-label="Sign out">↩</button>
        </div>
      </div>
    </aside>

    <main class="ws-main-area" id="ws-analytics">
      <header class="ws-topbar">
        <div class="ws-breadcrumbs" aria-label="Breadcrumb">
          <span>My Space</span><span class="ws-crumb-divider">/</span>
          <strong>Analytics</strong>
        </div>
        <div class="ws-topbar-right">
          <time id="ws-current-date"></time>
          <button type="button" class="ws-topbar-action" id="add-checkin-btn">
            <span aria-hidden="true">＋</span> Add check-in
          </button>
        </div>
      </header>

      <div class="ws-content-wrap">

        <!-- Wellness score banner -->
        <section class="ws-score-banner" aria-labelledby="ws-score-heading">
          <div class="ws-score-banner-copy">
            <div><p class="ws-score-title" id="ws-score-heading">Wellness score</p></div>
            <p class="ws-score-banner-note">A small snapshot of how you've been feeling and caring for yourself.</p>
            <p class="ws-metric-foot" id="ws-score-foot">Mood + habits, evenly weighted</p>
          </div>
          <div class="ws-score-chart-stack">
            <div class="ws-score-chart-wrap">
              <canvas id="ws-wellness-score-chart" role="img" aria-label="Wellness score"></canvas>
              <div class="ws-score-chart-center" aria-hidden="true">
                <strong id="ws-avg-score">—</strong><small id="ws-score-unit"></small>
              </div>
            </div>
            <span class="ws-score-status is-empty" id="ws-score-status" aria-live="polite">No score</span>
          </div>
        </section>

        <!-- Page intro + period control -->
        <section class="ws-page-intro" aria-labelledby="ws-page-title">
          <div>
            <p class="ws-eyebrow">YOUR WELLNESS JOURNEY</p>
            <h1 id="ws-page-title">Hi, ${firstName}. <em>Your pace.</em></h1>
            <p class="ws-intro-copy">Small steps add up. Here's how you've been doing.</p>
          </div>
          <div class="ws-intro-right">
            <!-- Visible on mobile where the sidebar (with its Plaza button) is hidden -->
            <button type="button" class="ws-plaza-btn-inline" id="enter-plaza-inline-btn">
              🎮 Enter the Plaza
            </button>
            <div class="ws-period-control">
              <label for="ws-period-select">Showing</label>
              <select id="ws-period-select" aria-label="Select date range">
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Summary cards -->
        <section class="ws-summary-grid" aria-label="Wellness averages">
          <article class="ws-summary-card ws-mood-summary">
            <div class="ws-summary-top">
              <span class="ws-summary-icon ws-mood-icon" id="ws-avg-mood-icon" aria-hidden="true">—</span>
              <span class="ws-metric-trend" id="ws-mood-caption">Daily average</span>
            </div>
            <p class="ws-metric-label">Average mood</p>
            <p class="ws-metric-value"><span id="ws-avg-mood">—</span><small> / 5</small></p>
            <p class="ws-metric-foot" id="ws-mood-foot">Across your check-ins</p>
          </article>
          <article class="ws-summary-card ws-sleep-summary">
            <div class="ws-summary-top"><span class="ws-summary-icon ws-sleep-icon" aria-hidden="true">☾</span><span class="ws-metric-trend">Rest &amp; reset</span></div>
            <p class="ws-metric-label">Sleep duration</p>
            <p class="ws-metric-value"><span id="ws-avg-sleep">—</span><small> hrs</small></p>
            <p class="ws-metric-foot">Average each night</p>
          </article>
          <article class="ws-summary-card ws-water-summary">
            <div class="ws-summary-top"><span class="ws-summary-icon ws-water-icon" aria-hidden="true">◒</span><span class="ws-metric-trend">Little sips count</span></div>
            <p class="ws-metric-label">Water intake</p>
            <p class="ws-metric-value"><span id="ws-avg-water">—</span><small> glasses</small></p>
            <p class="ws-metric-foot">Average each day</p>
          </article>
          <article class="ws-summary-card ws-activity-summary">
            <div class="ws-summary-top"><span class="ws-summary-icon ws-activity-icon" aria-hidden="true">↗</span><span class="ws-metric-trend">Move your way</span></div>
            <p class="ws-metric-label">Active minutes</p>
            <p class="ws-metric-value"><span id="ws-avg-activity">—</span><small> min</small></p>
            <p class="ws-metric-foot">Average each day</p>
          </article>
        </section>

        <!-- Charts -->
        <section class="ws-charts-grid" aria-label="Mood analytics">
          <article class="ws-panel ws-chart-panel ws-trend-panel">
            <div class="ws-panel-heading">
              <div><p class="ws-panel-kicker">A LITTLE CONTEXT</p><h2>Mood over time</h2></div>
              <span class="ws-chart-key" aria-label="Mood colour scale">
                <i class="ws-mood-dot mood-very-low" title="Very low"></i>
                <i class="ws-mood-dot mood-low" title="Low"></i>
                <i class="ws-mood-dot mood-okay" title="Okay"></i>
                <i class="ws-mood-dot mood-good" title="Good"></i>
                <i class="ws-mood-dot mood-great" title="Great"></i>
              </span>
            </div>
            <div class="ws-trend-chart-wrap"><canvas id="ws-mood-trend-chart" role="img" aria-label="Mood over time"></canvas></div>
            <p class="ws-chart-empty" id="ws-trend-empty" hidden>No check-ins in this period yet.</p>
          </article>
          <article class="ws-panel ws-chart-panel ws-balance-panel">
            <div class="ws-panel-heading"><div><p class="ws-panel-kicker">THE BIG PICTURE</p><h2>Mood balance</h2></div></div>
            <div class="ws-balance-content">
              <div class="ws-doughnut-wrap">
                <canvas id="ws-mood-balance-chart" role="img" aria-label="Mood distribution"></canvas>
                <div class="ws-doughnut-center" aria-hidden="true">
                  <strong id="ws-checkin-total">0</strong><span>check-ins</span>
                </div>
              </div>
              <ul class="ws-mood-legend" id="ws-mood-legend" aria-label="Mood category counts"></ul>
            </div>
            <p class="ws-chart-empty ws-balance-empty" id="ws-balance-empty" hidden>No moods to show yet.</p>
          </article>
        </section>

        <!-- Habits + recent check-ins -->
        <section class="ws-lower-grid" aria-label="Habits and recent entries">
          <article class="ws-panel ws-habits-panel">
            <div class="ws-panel-heading">
              <div><p class="ws-panel-kicker">GENTLE RHYTHMS</p><h2>Daily habits</h2></div>
              <span class="ws-heading-aside">Your daily average</span>
            </div>
            <div class="ws-habit-list">
              <div class="ws-habit-row" data-habit="sleep">
                <span class="ws-habit-icon ws-habit-moon" aria-hidden="true">☾</span>
                <div class="ws-habit-main">
                  <div class="ws-habit-heading"><strong>Sleep</strong><span><b id="ws-habit-sleep-value">—</b><small> / 8 hrs</small></span></div>
                  <div class="ws-progress-track" role="progressbar" aria-label="Sleep" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="ws-habit-sleep-bar"></span></div>
                </div>
              </div>
              <div class="ws-habit-row" data-habit="water">
                <span class="ws-habit-icon ws-habit-water" aria-hidden="true">◒</span>
                <div class="ws-habit-main">
                  <div class="ws-habit-heading"><strong>Water intake</strong><span><b id="ws-habit-water-value">—</b><small> / 8 glasses</small></span></div>
                  <div class="ws-progress-track" role="progressbar" aria-label="Water" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="ws-habit-water-bar"></span></div>
                </div>
              </div>
              <div class="ws-habit-row" data-habit="activity">
                <span class="ws-habit-icon ws-habit-move" aria-hidden="true">↗</span>
                <div class="ws-habit-main">
                  <div class="ws-habit-heading"><strong>Physical activity</strong><span><b id="ws-habit-activity-value">—</b><small> / 30 min</small></span></div>
                  <div class="ws-progress-track" role="progressbar" aria-label="Activity" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="ws-habit-activity-bar"></span></div>
                </div>
              </div>
            </div>
            <p class="ws-empty-inline" id="ws-habits-empty" hidden>Habits will appear after your first check-in.</p>
          </article>

          <article class="ws-panel ws-checkins-panel">
            <div class="ws-panel-heading">
              <div><p class="ws-panel-kicker">NOTES TO SELF</p><h2>Recent check-ins</h2></div>
              <button class="ws-text-action" id="ws-add-more-btn" type="button">Add new <span aria-hidden="true">→</span></button>
            </div>
            <div class="ws-checkin-list" id="ws-checkin-list" aria-live="polite"></div>
            <p class="ws-empty-inline" id="ws-checkins-empty" hidden>No check-ins yet. Add your first one!</p>
          </article>
        </section>

        <footer class="ws-page-footer">
          <span>WELLSCAPE <i aria-hidden="true">·</i></span>
          <span>Your wellbeing matters. Always.</span>
        </footer>
      </div>
    </main>

    <div class="ws-toast" id="ws-toast" role="status" aria-live="polite"></div>
  `;

  // ── Helpers ──────────────────────────────────────────────────────────────
  function $(id)  { return root.querySelector(`#${id}`); }
  function $$(sel){ return root.querySelectorAll(sel); }

  function showToast(msg) {
    const el = $("ws-toast");
    el.textContent = msg;
    el.classList.add("is-visible");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove("is-visible"), 2800);
  }

  function getFiltered(days) {
    const first = dateDaysAgo(referenceDate, days - 1);
    return wellnessData
      .filter(r => r.date >= first && r.date <= referenceDate)
      .sort((a, b) => a.date - b.date);
  }

  // ── Nav wiring ───────────────────────────────────────────────────────────
  $$(".ws-nav-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const section = link.dataset.section;
      $$(".ws-nav-link").forEach(l => { l.classList.remove("is-active"); l.removeAttribute("aria-current"); });
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
      if (onNav) onNav(section);
      else if (section !== "analytics") showToast(`${link.querySelector("span:last-child").textContent} — coming soon.`);
    });
  });

  $("enter-plaza-btn").addEventListener("click", () => onEnterPlaza?.());
  const inlineBtn = root.querySelector("#enter-plaza-inline-btn");
  if (inlineBtn) inlineBtn.addEventListener("click", () => onEnterPlaza?.());
  $("add-checkin-btn").addEventListener("click", () => onCheckin?.());
  $("ws-add-more-btn").addEventListener("click", () => onCheckin?.());

  // Logout button in the profile section.
  const logoutBtn = root.querySelector(".ws-logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await api.logout();
      onLogout?.();
    });
  }

  // ── Period select ────────────────────────────────────────────────────────
  $("ws-period-select").addEventListener("change", renderDashboard);

  // ── Date header ──────────────────────────────────────────────────────────
  $("ws-current-date").textContent = formatDate(new Date(), {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });

  // ── Render functions (ported 1-to-1 from WellscapeUI script.js) ─────────
  function renderSummary(records) {
    const moodA = avg(records, "mood");
    const sleepA = avg(records, "sleep");
    const waterA = avg(records, "water");
    const activityA = avg(records, "activity");
    const ws = wellnessScore(records);

    $("ws-avg-mood").textContent = fmt(moodA);
    $("ws-avg-mood-icon").textContent = moodA === null ? "—" : MOODS.find(m => m.score === Math.round(moodA)).emoji;
    $("ws-avg-sleep").textContent = fmt(sleepA);
    $("ws-avg-water").textContent = fmt(waterA);
    $("ws-avg-activity").textContent = fmt(activityA, 0);
    $("ws-avg-score").textContent = ws === null ? "—" : String(ws);
    $("ws-score-unit").textContent = ws === null ? "" : "%";

    const statusEl = $("ws-score-status");
    statusEl.textContent = ws === null ? "No score" : ws >= 70 ? "Good" : "Needs a boost";
    statusEl.className = `ws-score-status ${ws === null ? "is-empty" : ws >= 70 ? "is-good" : "is-low"}`;
    $("ws-score-foot").textContent = records.length ? "Mood + habits, evenly weighted" : "Add a check-in to calculate";
    $("ws-mood-foot").textContent = records.length
      ? `Across ${records.length} check-in${records.length === 1 ? "" : "s"}`
      : "No check-ins in this period";
  }

  function renderHabits(records) {
    [
      { key: "sleep",    goal: 8,  fmt: v => `${fmt(v)} hrs`  },
      { key: "water",    goal: 8,  fmt: v => fmt(v)           },
      { key: "activity", goal: 30, fmt: v => `${fmt(v, 0)} min` },
    ].forEach(({ key, goal, fmt: fmtFn }) => {
      const v = avg(records, key);
      const pct = v === null ? 0 : Math.min((v / goal) * 100, 100);
      $(`ws-habit-${key}-value`).textContent = v === null ? "—" : fmtFn(v);
      const bar = $(`ws-habit-${key}-bar`);
      bar.style.width = `${pct}%`;
      bar.parentElement.setAttribute("aria-valuenow", String(Math.round(pct)));
    });
    $("ws-habits-empty").hidden = records.length > 0;
  }

  function renderMoodLegend(moodCounts) {
    const legend = $("ws-mood-legend");
    legend.replaceChildren();
    moodCounts.forEach(m => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="ws-legend-label"><span class="ws-legend-emoji" aria-hidden="true">${m.emoji}</span>${m.label}</span><span class="ws-legend-count">${m.count}</span>`;
      legend.append(li);
    });
  }

  function renderCharts(records) {
    if (typeof Chart === "undefined") {
      $("ws-trend-empty").hidden = false;
      $("ws-trend-empty").textContent = "Charts need an internet connection to load.";
      $("ws-balance-empty").hidden = false;
      return;
    }

    const moodCounts = MOODS.map(m => ({ ...m, count: records.filter(r => r.mood === m.score).length }));
    const pointColors = records.map(r => MOODS.find(m => m.score === r.mood).color);
    const chartText = "#879187";
    const gridColor = "rgba(113,132,113,.11)";

    if (moodTrendChart)   moodTrendChart.destroy();
    if (moodBalanceChart) moodBalanceChart.destroy();
    if (wsChart)          wsChart.destroy();

    moodTrendChart = new Chart(root.querySelector("#ws-mood-trend-chart"), {
      type: "line",
      data: {
        labels: records.map(r => formatDate(r.date)),
        datasets: [{
          label: "Mood score",
          data: records.map(r => r.mood),
          borderColor: "#6e8c70",
          backgroundColor: "rgba(142,168,139,.15)",
          fill: true, tension: 0.38, borderWidth: 2.5,
          pointRadius: 4, pointHoverRadius: 6,
          pointBackgroundColor: pointColors,
          pointBorderColor: "#fff", pointBorderWidth: 2.5,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#304b3b", padding: 10, displayColors: false,
            callbacks: { label(ctx) { const m = MOODS.find(x => x.score === ctx.parsed.y); return `${m.emoji} ${ctx.parsed.y}/5 · ${m.label}`; } },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { display: false }, ticks: { color: chartText, font: { family: "DM Sans", size: 9 } } },
          y: { min: 1, max: 5, ticks: { stepSize: 1, color: chartText, padding: 8, font: { family: "DM Sans", size: 9 } }, grid: { color: gridColor, drawTicks: false }, border: { display: false } },
        },
      },
    });

    moodBalanceChart = new Chart(root.querySelector("#ws-mood-balance-chart"), {
      type: "doughnut",
      data: {
        labels: moodCounts.map(m => m.label),
        datasets: [{ data: moodCounts.map(m => m.count), backgroundColor: moodCounts.map(m => m.color), borderColor: "#fff", borderWidth: 3, hoverOffset: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "73%",
        plugins: { legend: { display: false }, tooltip: { enabled: records.length > 0 } },
      },
    });

    const ws = wellnessScore(records);
    wsChart = new Chart(root.querySelector("#ws-wellness-score-chart"), {
      type: "doughnut",
      data: {
        labels: ["Score", "Remaining"],
        datasets: [{
          data: ws === null ? [0, 100] : [ws, 100 - ws],
          backgroundColor: ws === null
            ? ["rgba(255,255,255,.25)", "rgba(255,255,255,.12)"]
            : [ws >= 70 ? "#f0cf83" : "#e9ad8c", "rgba(255,255,255,.14)"],
          borderWidth: 0, hoverOffset: 0,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "78%",
        plugins: { legend: { display: false }, tooltip: { enabled: ws !== null, callbacks: { label: () => `${ws}% wellness score` } } },
      },
    });

    $("ws-checkin-total").textContent = String(records.length);
    renderMoodLegend(moodCounts);
    $("ws-trend-empty").hidden = records.length > 0;
    $("ws-balance-empty").hidden = records.length > 0;
  }

  function renderCheckins(records) {
    const list = $("ws-checkin-list");
    list.replaceChildren();
    [...records].reverse().slice(0, 4).forEach(record => {
      const mood = MOODS.find(m => m.score === record.mood);
      const row = document.createElement("div");
      row.className = "ws-checkin-row";
      row.innerHTML = `
        <span class="ws-checkin-emoji" aria-hidden="true">${mood.emoji}</span>
        <div class="ws-checkin-copy">
          <div class="ws-checkin-meta">
            <strong>${mood.label}</strong>
            <time datetime="${record.date.toISOString().slice(0,10)}">${formatDate(record.date)}</time>
          </div>
          <p class="ws-checkin-note">${record.note || ""}</p>
        </div>
        <span class="ws-checkin-score">${record.mood}<small> / 5</small></span>
      `;
      list.append(row);
    });
    $("ws-checkins-empty").hidden = records.length > 0;
  }

  function renderDashboard() {
    const days = Number($("ws-period-select").value);
    const records = getFiltered(days);
    renderSummary(records);
    renderCharts(records);
    renderHabits(records);
    renderCheckins(records);
  }

  // ── Load data then render ────────────────────────────────────────────────
  async function load() {
    try {
      const res = await fetch("/api/checkins", { credentials: "include" });
      if (!res.ok) throw new Error("Could not load check-ins.");
      const rows = await res.json();
      wellnessData.push(...rows.map(r => ({ ...r, date: new Date(`${r.date}T00:00:00`) })));
    } catch {
      showToast("Could not load your check-ins. Make sure the server is running.");
    }
    renderDashboard();
  }

  load();

  function destroy() {
    moodTrendChart?.destroy();
    moodBalanceChart?.destroy();
    wsChart?.destroy();
    clearTimeout(toastTimeout);
  }

  return { el: root, destroy };
}

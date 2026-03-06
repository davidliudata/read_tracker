// --- Setup check ---
const CONFIGURED = SUPABASE_URL !== 'YOUR_SUPABASE_URL';
const db = CONFIGURED ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// --- Constants ---
const ACTIVITY = {
  reading:  { icon: '📚', label: 'Reading',  color: '#3182ce' },
  swimming: { icon: '🏊', label: 'Swimming', color: '#0987a0' },
  walking:  { icon: '🚶', label: 'Walking',  color: '#48bb78' },
};

const CIRCUM = 2 * Math.PI * 50; // SVG ring circumference

const BADGES = [
  { id: 'first',      icon: '🌱', name: 'First Step',    desc: 'Log your first session',
    check: s => s.length >= 1 },
  { id: 'week',       icon: '🔥', name: 'Week Warrior',  desc: '7-day streak',
    check: (s, st) => st.streak >= 7 },
  { id: 'month',      icon: '💪', name: 'Month Master',  desc: '30-day streak',
    check: (s, st) => st.streak >= 30 },
  { id: 'bookworm',   icon: '📚', name: 'Bookworm',      desc: 'Read for 10 hours',
    check: s => s.filter(x => x.activity_type === 'reading').reduce((n, x) => n + x.minutes, 0) >= 600 },
  { id: 'swimmer',    icon: '🏊', name: 'Swimmer',       desc: 'Log 10 swimming sessions',
    check: s => s.filter(x => x.activity_type === 'swimming').length >= 10 },
  { id: 'walker',     icon: '🚶', name: 'Walker',        desc: 'Log 10 walking sessions',
    check: s => s.filter(x => x.activity_type === 'walking').length >= 10 },
  { id: 'allrounder', icon: '🌟', name: 'All-Rounder',   desc: 'Try all 3 activities',
    check: s => new Set(s.map(x => x.activity_type)).size >= 3 },
  { id: 'powerday',   icon: '⚡', name: 'Power Day',     desc: '2+ hours of activity in one day',
    check: s => { const m={}; s.forEach(x => m[x.date]=(m[x.date]||0)+x.minutes); return Object.values(m).some(v=>v>=120); } },
  { id: 'century',    icon: '🏆', name: 'Century',       desc: '100 hours of total activity',
    check: s => s.reduce((n, x) => n + x.minutes, 0) >= 6000 },
  { id: 'consistent', icon: '📅', name: 'Consistent',    desc: 'Log 30 sessions total',
    check: s => s.length >= 30 },
];

// --- State ---
let progressChart  = null;
let monthlyChart   = null;
let currentRange   = 30;
let currentActivity = 'reading';

// --- Goal (localStorage) ---
const GOAL_KEY = 'daily_goal_minutes';
function getGoal() { return parseInt(localStorage.getItem(GOAL_KEY) || '30'); }
function setGoal(v) { localStorage.setItem(GOAL_KEY, String(v)); }

// --- Data ---
async function getSessions() {
  if (!CONFIGURED) return getLocalSessions();
  const { data, error } = await db.from('reading_sessions').select('*').order('date');
  if (error) { console.error(error); return []; }
  return data.map(s => ({ activity_type: 'reading', ...s }));
}

async function addSession(book, date, minutes, activity_type) {
  if (!CONFIGURED) { addLocalSession(book, date, minutes, activity_type); return; }
  const { error } = await db.from('reading_sessions').insert({ book: book || null, date, minutes: parseInt(minutes), activity_type });
  if (error) throw error;
}

async function deleteSession(id) {
  if (!CONFIGURED) { deleteLocalSession(id); return; }
  const { error } = await db.from('reading_sessions').delete().eq('id', id);
  if (error) throw error;
}

// --- Local fallback ---
const LOCAL_KEY = 'reading_sessions';
function getLocalSessions() {
  const s = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
  return s.map(x => ({ activity_type: 'reading', ...x })); // migrate old data
}
function saveLocalSessions(s) { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); }
function addLocalSession(book, date, minutes, activity_type) {
  const s = getLocalSessions();
  s.push({ id: Date.now(), book: book || null, date, minutes: parseInt(minutes), activity_type });
  saveLocalSessions(s);
}
function deleteLocalSession(id) {
  saveLocalSessions(getLocalSessions().filter(s => s.id !== id));
}

// --- Real-time ---
function setupRealtime() {
  if (!CONFIGURED) return;
  db.channel('changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reading_sessions' }, renderAll)
    .subscribe();
}

// --- Aggregation ---
function getDailySummary(sessions, monthFilter) {
  const filtered = monthFilter ? sessions.filter(s => s.date.startsWith(monthFilter)) : sessions;
  const map = {};
  for (const s of filtered) {
    if (!map[s.date]) map[s.date] = { minutes: 0, activities: new Set() };
    map[s.date].minutes += s.minutes;
    map[s.date].activities.add(s.activity_type);
  }
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, d]) => ({ date, minutes: d.minutes, activities: [...d.activities] }));
}

function getMonthlySummary(sessions) {
  const map = {};
  for (const s of sessions) {
    const month = s.date.slice(0, 7);
    if (!map[month]) map[month] = { minutes: 0, activities: new Set() };
    map[month].minutes += s.minutes;
    map[month].activities.add(s.activity_type);
  }
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, d]) => ({ month, minutes: d.minutes, activities: [...d.activities] }));
}

function computeStats(sessions) {
  const total = sessions.reduce((n, s) => n + s.minutes, 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotal = sessions.filter(s => s.date.startsWith(thisMonth)).reduce((n, s) => n + s.minutes, 0);
  const days = new Set(sessions.map(s => s.date)).size;

  const dateSet = new Set(sessions.map(s => s.date));
  let streak = 0;
  const d = new Date();
  if (!dateSet.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (dateSet.has(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }

  const today = new Date().toISOString().slice(0, 10);
  const loggedToday = sessions.some(s => s.date === today);

  return { total, monthTotal, days, streak, loggedToday };
}

// --- Formatting ---
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return new Date(y, m-1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function formatMonth(monthStr) {
  const [y, m] = monthStr.split('-');
  return new Date(y, m-1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}
function formatMins(mins) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Goal ring ---
function renderGoalRing(sessions) {
  const goal = getGoal();
  const today = new Date().toISOString().slice(0, 10);
  const todaySessions = sessions.filter(s => s.date === today);
  const todayMins = todaySessions.reduce((n, s) => n + s.minutes, 0);
  const progress = Math.min(todayMins / goal, 1);

  const ring = document.getElementById('ring-fill');
  ring.style.strokeDashoffset = CIRCUM * (1 - progress);
  ring.style.stroke = progress >= 1 ? '#48bb78' : '#3182ce';

  document.getElementById('ring-value').textContent = todayMins;
  document.getElementById('goal-target-label').textContent = `Goal: ${formatMins(goal)}`;

  // Activity breakdown icons for today
  const breakdown = {};
  todaySessions.forEach(s => { breakdown[s.activity_type] = (breakdown[s.activity_type] || 0) + s.minutes; });
  document.getElementById('goal-breakdown').innerHTML = Object.entries(breakdown).map(([type, mins]) =>
    `<span class="goal-pill" style="background:${ACTIVITY[type]?.color}22;color:${ACTIVITY[type]?.color}">
      ${ACTIVITY[type]?.icon} ${formatMins(mins)}
    </span>`
  ).join('') || '<span class="goal-none">Nothing logged yet</span>';
}

// --- Streak warning ---
function renderStreakWarning(sessions) {
  const { streak, loggedToday } = computeStats(sessions);
  const el = document.getElementById('streak-warning');
  if (streak >= 1 && !loggedToday) {
    el.innerHTML = `⚠️ You haven't logged anything today — your <strong>${streak}-day streak</strong> is at risk!`;
    el.classList.remove('hidden');
  } else {
    el.classList.add('hidden');
  }
}

// --- Stat cards ---
function renderStatCards(sessions) {
  const { total, monthTotal, days, streak } = computeStats(sessions);
  document.getElementById('stat-cards').innerHTML = `
    <div class="stat-card">           <div class="stat-value">${formatMins(total)}</div>   <div class="stat-label">Total Active</div></div>
    <div class="stat-card accent-green">  <div class="stat-value">${formatMins(monthTotal)}</div><div class="stat-label">This Month</div></div>
    <div class="stat-card accent-purple"> <div class="stat-value">${days}</div>              <div class="stat-label">Days Active</div></div>
    <div class="stat-card accent-orange"> <div class="stat-value">${streak} 🔥</div>        <div class="stat-label">Day Streak</div></div>
  `;
}

// --- Badges ---
function renderBadges(sessions) {
  const stats = computeStats(sessions);
  document.getElementById('badges-grid').innerHTML = BADGES.map(b => {
    const earned = b.check(sessions, stats);
    return `
      <div class="badge-card ${earned ? 'earned' : 'locked'}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
        ${earned ? '<div class="badge-earned-label">Earned</div>' : ''}
      </div>`;
  }).join('');
}

// --- List rendering ---
function renderDaily(sessions) {
  const filter = document.getElementById('daily-month-filter').value;
  const daily = getDailySummary(sessions, filter);
  const el = document.getElementById('daily-list');
  if (!daily.length) { el.innerHTML = '<div class="empty">No sessions logged yet.</div>'; return; }
  el.innerHTML = daily.map(d => `
    <div class="summary-item">
      <div>
        <div class="date-label">${formatDate(d.date)}</div>
        <div class="books-label">${d.activities.map(a => ACTIVITY[a]?.icon + ' ' + ACTIVITY[a]?.label).join(' · ')}</div>
      </div>
      <div class="minutes-badge">${formatMins(d.minutes)}</div>
    </div>`).join('');
}

function renderMonthly(sessions) {
  const monthly = getMonthlySummary(sessions);
  const el = document.getElementById('monthly-list');
  if (!monthly.length) { el.innerHTML = '<div class="empty">No sessions logged yet.</div>'; return; }
  el.innerHTML = monthly.map(m => `
    <div class="summary-item monthly-item">
      <div>
        <div class="date-label">${formatMonth(m.month)}</div>
        <div class="books-label">${m.activities.map(a => ACTIVITY[a]?.icon + ' ' + ACTIVITY[a]?.label).join(' · ')}</div>
      </div>
      <div class="minutes-badge">${formatMins(m.minutes)}</div>
    </div>`).join('');
}

function renderSessions(sessions) {
  const sorted = sessions.slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));
  const el = document.getElementById('sessions-list');
  if (!sorted.length) { el.innerHTML = '<div class="empty">No sessions logged yet.</div>'; return; }
  el.innerHTML = sorted.map(s => {
    const act = ACTIVITY[s.activity_type] || ACTIVITY.reading;
    const label = s.activity_type === 'reading' && s.book ? escHtml(s.book) : (s.book ? escHtml(s.book) : act.label);
    return `
    <div class="session-row">
      <div class="session-left">
        <div class="session-book">
          <span class="session-icon" style="color:${act.color}">${act.icon}</span> ${label}
        </div>
        <div class="session-date">${formatDate(s.date)}</div>
      </div>
      <div class="session-right">
        <span class="session-mins" style="color:${act.color}">${formatMins(s.minutes)}</span>
        <button class="btn-delete" data-id="${s.id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('');
}

// --- Charts ---
function getDaysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

const APEX_BASE = {
  chart: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', toolbar: { show: false } },
  grid: { borderColor: '#f0f4f8', strokeDashArray: 4 },
  tooltip: { theme: 'light', style: { fontSize: '13px' } },
};

function renderMonthlyChart(sessions, monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const days = getDaysInMonth(y, m);
  // Stack by activity type
  const maps = { reading: {}, swimming: {}, walking: {} };
  for (const s of sessions) {
    if (!s.date.startsWith(monthStr)) continue;
    const day = parseInt(s.date.split('-')[2]);
    const type = s.activity_type || 'reading';
    if (maps[type]) maps[type][day] = (maps[type][day] || 0) + s.minutes;
  }
  const labels = Array.from({ length: days }, (_, i) => i + 1);
  const series = Object.entries(maps)
    .filter(([, map]) => Object.keys(map).length > 0)
    .map(([type, map]) => ({
      name: ACTIVITY[type].label,
      data: labels.map(d => map[d] || 0),
      color: ACTIVITY[type].color,
    }));
  if (!series.length) series.push({ name: 'Reading', data: labels.map(() => 0), color: '#3182ce' });

  if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
  monthlyChart = new ApexCharts(document.getElementById('monthly-chart'), {
    ...APEX_BASE,
    chart: { ...APEX_BASE.chart, type: 'bar', height: 260, stacked: true,
      animations: { enabled: true, easing: 'easeinout', speed: 500 } },
    series,
    xaxis: {
      categories: labels,
      labels: { style: { colors: '#a0aec0', fontSize: '11px' } },
      axisBorder: { show: false }, axisTicks: { show: false },
      title: { text: formatMonth(monthStr), style: { color: '#718096', fontSize: '11px', fontWeight: 500 } },
    },
    yaxis: { labels: { formatter: v => v > 0 ? formatMins(v) : '0', style: { colors: '#a0aec0', fontSize: '11px' } }, min: 0 },
    plotOptions: { bar: { borderRadius: 4, columnWidth: '60%' } },
    dataLabels: { enabled: false },
    legend: { position: 'top', fontSize: '12px', markers: { radius: 4 } },
    tooltip: { ...APEX_BASE.tooltip, y: { formatter: v => formatMins(v) }, x: { formatter: v => `Day ${v}` } },
    fill: { opacity: 0.9 },
  });
  monthlyChart.render();
}

function renderProgressChart(sessions, rangeDays) {
  const today = new Date();
  const typeKeys = ['reading', 'swimming', 'walking'];
  const dateMaps = { reading: {}, swimming: {}, walking: {} };

  if (rangeDays === 0) {
    for (const s of sessions) {
      const type = s.activity_type || 'reading';
      dateMaps[type][s.date] = (dateMaps[type][s.date] || 0) + s.minutes;
    }
  } else {
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      typeKeys.forEach(t => { dateMaps[t][key] = 0; });
    }
    for (const s of sessions) {
      const type = s.activity_type || 'reading';
      if (s.date in dateMaps[type]) dateMaps[type][s.date] += s.minutes;
    }
  }

  const allDates = [...new Set(Object.values(dateMaps).flatMap(m => Object.keys(m)))].sort();
  const series = typeKeys
    .filter(type => Object.values(dateMaps[type]).some(v => v > 0))
    .map(type => ({
      name: ACTIVITY[type].label,
      data: allDates.map(d => ({
        x: new Date(...d.split('-').map((v, i) => i === 1 ? v - 1 : Number(v))).getTime(),
        y: dateMaps[type][d] || 0,
      })),
      color: ACTIVITY[type].color,
    }));
  if (!series.length) series.push({ name: 'Reading', data: [], color: '#3182ce' });

  if (progressChart) { progressChart.destroy(); progressChart = null; }
  progressChart = new ApexCharts(document.getElementById('progress-chart'), {
    ...APEX_BASE,
    chart: {
      ...APEX_BASE.chart, type: 'area', height: 300, stacked: false,
      zoom: { enabled: true, type: 'x' },
      toolbar: { show: true, tools: { download: false, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true, reset: true } },
      animations: { enabled: true, easing: 'easeinout', speed: 600 },
    },
    series,
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#a0aec0', fontSize: '11px' }, datetimeUTC: false,
        format: rangeDays === 0 || rangeDays > 60 ? 'MMM yy' : 'MMM dd' },
      axisBorder: { show: false }, axisTicks: { show: false },
      crosshairs: { show: true, stroke: { color: '#4299e1', width: 1, dashArray: 4 } },
    },
    yaxis: { labels: { formatter: v => v > 0 ? formatMins(v) : '0', style: { colors: '#a0aec0', fontSize: '11px' } }, min: 0 },
    fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0.02, stops: [0, 95] } },
    stroke: { curve: 'smooth', width: 2.5 },
    markers: { size: 3, strokeWidth: 2, hover: { size: 5 } },
    dataLabels: { enabled: false },
    legend: { position: 'top', fontSize: '12px', markers: { radius: 4 } },
    tooltip: { ...APEX_BASE.tooltip, x: { format: 'MMM dd, yyyy' }, y: { formatter: v => formatMins(v) } },
  });
  progressChart.render();
}

// --- Render all ---
async function renderAll() {
  const sessions = await getSessions();
  renderGoalRing(sessions);
  renderStreakWarning(sessions);
  renderStatCards(sessions);
  renderBadges(sessions);
  renderDaily(sessions);
  renderMonthly(sessions);
  renderSessions(sessions);
  const mf = document.getElementById('monthly-chart-filter').value;
  if (mf) renderMonthlyChart(sessions, mf);
  renderProgressChart(sessions, currentRange);
}

// --- Setup banner ---
function renderSetupBanner() {
  if (CONFIGURED) return;
  const banner = document.createElement('div');
  banner.className = 'setup-banner';
  banner.innerHTML = `
    <strong>Running locally</strong> — data is saved on this device only.
    To share with family, <a href="#" onclick="document.getElementById('setup-instructions').classList.toggle('hidden');return false;">set up Supabase</a>.
    <div id="setup-instructions" class="hidden setup-steps">
      <ol>
        <li>Go to <strong>supabase.com</strong> → create a free project</li>
        <li>In the SQL Editor, run the setup query (see <code>SETUP.md</code>)</li>
        <li>Go to <strong>Settings → API</strong>, copy your Project URL &amp; anon key</li>
        <li>Paste them into <code>config.js</code> and reload</li>
        <li>Deploy the folder to <strong>netlify.com</strong> (drag &amp; drop) to share the URL</li>
      </ol>
    </div>`;
  document.querySelector('.container').prepend(banner);
}

// --- Sample data (seeds once) ---
async function seedSampleData() {
  const sessions = await getSessions();
  if (sessions.length > 0) {
    // Add swimming/walking examples if not yet present
    if (!sessions.some(s => s.activity_type === 'swimming' || s.activity_type === 'walking')) {
      await seedExtraActivities();
    }
    return;
  }
  const today = new Date();
  const reading = [
    [89,'Atomic Habits',25],[88,'Atomic Habits',40],[86,'Dune',35],[85,'Atomic Habits',30],
    [84,'Dune',50],[82,'Atomic Habits',45],[81,'Dune',60],[80,'Dune',25],
    [78,'Atomic Habits',55],[77,'Dune',40],[75,'Atomic Habits',20],[74,'Dune',70],
    [73,'Dune',45],[71,'Atomic Habits',30],[70,'Dune',50],[68,'Dune',90],
    [67,'Atomic Habits',35],[65,'Dune',60],[64,'The Pragmatic Programmer',30],[63,'Dune',45],
    [60,'The Pragmatic Programmer',40],[59,'Deep Work',50],[57,'The Pragmatic Programmer',35],
    [56,'Deep Work',60],[55,'Deep Work',45],[53,'The Pragmatic Programmer',55],
    [52,'Deep Work',70],[50,'The Pragmatic Programmer',40],[49,'Deep Work',30],
    [48,'Deep Work',80],[46,'The Pragmatic Programmer',45],[45,'Deep Work',60],
    [43,'The Pragmatic Programmer',50],[42,'Deep Work',35],[40,'The Pragmatic Programmer',65],
    [39,'Project Hail Mary',40],[37,'Deep Work',55],[36,'Project Hail Mary',50],
    [35,'Project Hail Mary',45],[30,'Project Hail Mary',60],[29,'Project Hail Mary',75],
    [27,'Project Hail Mary',45],[26,'Project Hail Mary',90],[24,'Project Hail Mary',30],
    [23,'Project Hail Mary',60],[21,'Project Hail Mary',50],[20,'Project Hail Mary',80],
    [18,'Project Hail Mary',55],[17,'Project Hail Mary',40],[15,'Project Hail Mary',70],
    [14,'Project Hail Mary',60],[12,'Project Hail Mary',45],[11,'Project Hail Mary',35],
    [9,'Project Hail Mary',90],[8,'Project Hail Mary',50],[6,'Project Hail Mary',65],
    [5,'Project Hail Mary',40],[3,'Project Hail Mary',75],[2,'Project Hail Mary',55],
    [1,'Project Hail Mary',60],[0,'Project Hail Mary',30],
  ].map(([ago, book, mins], i) => {
    const d = new Date(today); d.setDate(d.getDate() - ago);
    return { id: 1000 + i, book, date: d.toISOString().slice(0, 10), minutes: mins, activity_type: 'reading' };
  });

  const extra = buildExtraActivities(today, reading.length);
  const rows = [...reading, ...extra];
  if (!CONFIGURED) saveLocalSessions(rows);
  else await db.from('reading_sessions').insert(rows.map(({ book, date, minutes, activity_type }) => ({ book, date, minutes, activity_type })));
}

function buildExtraActivities(today, idOffset) {
  return [
    [88,'swimming',30],[85,'walking',40],[83,'swimming',25],[79,'walking',45],
    [76,'swimming',35],[72,'walking',30],[69,'swimming',40],[66,'walking',35],
    [62,'swimming',30],[58,'walking',45],[54,'swimming',35],[51,'walking',40],
    [47,'swimming',30],[44,'walking',35],[41,'swimming',40],[38,'walking',30],
    [34,'swimming',45],[31,'walking',40],[28,'swimming',30],[25,'walking',35],
    [22,'swimming',45],[19,'walking',30],[16,'swimming',40],[13,'walking',35],
    [10,'swimming',30],[7,'walking',45],[4,'swimming',35],[1,'walking',30],
  ].map(([ago, type, mins], i) => {
    const d = new Date(today); d.setDate(d.getDate() - ago);
    return { id: 2000 + idOffset + i, book: null, date: d.toISOString().slice(0, 10), minutes: mins, activity_type: type };
  });
}

async function seedExtraActivities() {
  const today = new Date();
  const rows = buildExtraActivities(today, 500);
  if (!CONFIGURED) {
    const existing = getLocalSessions();
    saveLocalSessions([...existing, ...rows]);
  } else {
    await db.from('reading_sessions').insert(rows.map(({ book, date, minutes, activity_type }) => ({ book, date, minutes, activity_type })));
  }
}

// --- Toast ---
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

// --- Init ---
document.addEventListener('DOMContentLoaded', async () => {
  renderSetupBanner();
  await seedSampleData();
  setupRealtime();

  document.getElementById('read-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('monthly-chart-filter').value = new Date().toISOString().slice(0, 7);
  document.getElementById('daily-month-filter').value = new Date().toISOString().slice(0, 7);

  await renderAll();

  // Activity type tabs
  document.querySelectorAll('.activity-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.activity-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentActivity = btn.dataset.activity;
      const bookGroup = document.getElementById('book-group');
      const bookInput = document.getElementById('book-name');
      const bookLabel = document.getElementById('book-label');
      if (currentActivity === 'reading') {
        bookGroup.style.display = '';
        bookLabel.textContent = 'Book Name';
        bookInput.placeholder = 'Enter book title...';
        bookInput.required = true;
      } else {
        bookGroup.style.display = '';
        bookLabel.textContent = 'Note (optional)';
        bookInput.placeholder = 'e.g. Morning jog, Pool laps...';
        bookInput.required = false;
      }
    });
  });

  // Form submit
  document.getElementById('log-form').addEventListener('submit', async e => {
    e.preventDefault();
    const book    = document.getElementById('book-name').value.trim();
    const date    = document.getElementById('read-date').value;
    const minutes = document.getElementById('minutes').value;
    if (!date || !minutes) return;
    if (currentActivity === 'reading' && !book) return;
    try {
      await addSession(book || null, date, minutes, currentActivity);
      document.getElementById('book-name').value = '';
      document.getElementById('minutes').value = '';
      if (!CONFIGURED) await renderAll();
      showToast(`${ACTIVITY[currentActivity].icon} Session logged!`);
    } catch (err) { showToast('Error saving session.'); console.error(err); }
  });

  // Delete session
  document.getElementById('sessions-list').addEventListener('click', async e => {
    const btn = e.target.closest('.btn-delete');
    if (!btn) return;
    try {
      await deleteSession(CONFIGURED ? btn.dataset.id : Number(btn.dataset.id));
      if (!CONFIGURED) await renderAll();
      showToast('Session deleted.');
    } catch (err) { showToast('Error deleting.'); }
  });

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');
    });
  });

  // Daily filter
  document.getElementById('daily-month-filter').addEventListener('change', async () => {
    const s = await getSessions(); renderDaily(s);
  });

  // Monthly chart filter
  document.getElementById('monthly-chart-filter').addEventListener('change', async () => {
    const s = await getSessions();
    renderMonthlyChart(s, document.getElementById('monthly-chart-filter').value);
  });

  // Progress range
  document.querySelectorAll('.range-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRange = parseInt(btn.dataset.range);
      const s = await getSessions(); renderProgressChart(s, currentRange);
    });
  });

  // Goal edit
  document.getElementById('btn-edit-goal').addEventListener('click', async () => {
    const current = getGoal();
    const val = prompt(`Set daily goal (minutes):`, current);
    if (val === null) return;
    const n = parseInt(val);
    if (n > 0) {
      setGoal(n);
      const s = await getSessions();
      renderGoalRing(s);
    }
  });
});

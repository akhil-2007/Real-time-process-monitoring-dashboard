// app.js - ready to paste
const API_URL = "http://127.0.0.1:5000";

let autoRefresh = true;
let intervalId = null;
let cpuHistory = [];
let memHistory = [];
let cpuChart = null;
let memChart = null;
let processesCache = [];

// alert thresholds
const ALERT_CPU = 80;
const ALERT_MEM = 80;

document.addEventListener("DOMContentLoaded", () => {
  initControls();
  fetchAndRender();
  startAutoRefresh();
});

/* ---------- controls ---------- */
function initControls() {
  document.getElementById("refreshBtn").addEventListener("click", fetchAndRender);

  document.getElementById("autoRefreshToggle").addEventListener("change", (e) => {
    autoRefresh = !!e.target.checked;
    if (autoRefresh) startAutoRefresh();
    else stopAutoRefresh();
  });

  // filter buttons
  document.querySelectorAll(".filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(x => x.classList.remove("active"));
      btn.classList.add("active");
      renderTable(); // uses current cache, search, sort
    });
  });

  // search input
  document.getElementById("searchInput").addEventListener("input", () => renderTable());

  // sort select
  document.getElementById("sortSelect").addEventListener("change", () => renderTable());
}

/* ---------- fetch + render ---------- */
async function fetchAndRender() {
  try {
    const res = await fetch(`${API_URL}/stats`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // normalize missing fields
    data.processes = Array.isArray(data.processes) ? data.processes : [];

    processesCache = data.processes;

    updateSummary(data);
    updateCharts(data);
    renderTable();

    setStatus("Connected");
  } catch (err) {
    console.warn("fetch error:", err);
    setStatus("Disconnected");
    // keep charts and table alive (empty) — do not throw
  }
}

/* ---------- status ---------- */
function setStatus(text) {
  const el = document.getElementById("connectionStatus");
  if (el) el.innerText = text;
  const t = document.getElementById("lastUpdated");
  if (t) t.innerText = new Date().toLocaleTimeString();
}

/* ---------- summary ---------- */
function updateSummary(data) {
  const cpu = typeof data.cpu_usage === "number" ? data.cpu_usage : 0;
  const mem = typeof data.memory_usage === "number" ? data.memory_usage : 0;
  const procs = Array.isArray(data.processes) ? data.processes : [];

  document.getElementById("cpuUsageValue").innerText = `${cpu}%`;
  document.getElementById("memUsageValue").innerText = `${mem}%`;
  document.getElementById("processCount").innerText = procs.length;

  const running = procs.filter(p => p.status === "running").length;
  const sleeping = procs.filter(p => p.status === "sleeping").length;
  const stopped = procs.filter(p => p.status === "stopped").length;

  document.getElementById("runningCount").innerText = running;
  document.getElementById("sleepingCount").innerText = sleeping;
  document.getElementById("stoppedCount").innerText = stopped;

  const alerts = procs.filter(p => (p.cpu_percent || 0) > ALERT_CPU || (p.memory_percent || 0) > ALERT_MEM);
  document.getElementById("alertCount").innerText = alerts.length;
  document.getElementById("alertList").innerHTML = alerts.map(p =>
    `<li>${escapeHtml(p.name||"unknown")} (PID: ${p.pid}) – CPU: ${(p.cpu_percent||0).toFixed(1)}% MEM: ${(p.memory_percent||0).toFixed(1)}%</li>`
  ).join("");

  // progress bars (safe)
  document.getElementById("cpuUsageBar").style.width = Math.min(100, cpu) + "%";
  document.getElementById("memUsageBar").style.width = Math.min(100, mem) + "%";

  // mem details if available (memory_used / memory_total in bytes expected)
  if (typeof data.memory_used === "number" && typeof data.memory_total === "number" && data.memory_total > 0) {
    const usedGB = (data.memory_used / 1024 / 1024 / 1024).toFixed(1);
    const totalGB = (data.memory_total / 1024 / 1024 / 1024).toFixed(1);
    document.getElementById("memDetails").innerText = `${usedGB} / ${totalGB} GB`;
  } else {
    document.getElementById("memDetails").innerText = "0 / 0 GB";
  }
}

/* ---------- table rendering (filter/search/sort) ---------- */
function getActiveFilter() {
  const b = document.querySelector(".filter-btn.active");
  return b ? b.dataset.filter : "all";
}

function renderTable() {
  const procs = Array.isArray(processesCache) ? processesCache.slice() : [];
  let list = procs;

  // apply filter
  const filter = getActiveFilter();
  if (filter === "high-cpu") list = list.filter(p => (p.cpu_percent || 0) > 20);
  if (filter === "high-mem") list = list.filter(p => (p.memory_percent || 0) > 20);
  if (filter === "stopped") list = list.filter(p => (p.status || "").toLowerCase() === "stopped");

  // apply search
  const q = (document.getElementById("searchInput").value || "").trim().toLowerCase();
  if (q) {
    list = list.filter(p => {
      const name = (p.name || "").toString().toLowerCase();
      const pid = String(p.pid || "");
      return name.includes(q) || pid.includes(q);
    });
  }

  // apply sort
  const sort = document.getElementById("sortSelect").value;
  list.sort((a,b) => {
    if (sort === "cpu-desc") return (b.cpu_percent||0) - (a.cpu_percent||0);
    if (sort === "cpu-asc") return (a.cpu_percent||0) - (b.cpu_percent||0);
    if (sort === "mem-desc") return (b.memory_percent||0) - (a.memory_percent||0);
    if (sort === "mem-asc") return (a.memory_percent||0) - (b.memory_percent||0);
    if (sort === "name-asc") return (String(a.name||"")).localeCompare(String(b.name||""));
    if (sort === "pid-asc") return (a.pid||0) - (b.pid||0);
    return 0;
  });

  // update process count after filter/search (optional)
  document.getElementById("processCount").innerText = list.length;

  const tbody = document.getElementById("processTableBody");
  tbody.innerHTML = "";

  list.forEach(p => {
    const pid = p.pid || "";
    const name = escapeHtml(p.name || "");
    const user = escapeHtml(p.username || "system");
    const cpu = (p.cpu_percent || 0).toFixed(1);
    const mem = (p.memory_percent || 0).toFixed(1);
    const status = escapeHtml(p.status || "");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${pid}</td>
      <td>${name}</td>
      <td>${user}</td>
      <td class="${(p.cpu_percent||0) > ALERT_CPU ? 'cpu-high' : ''}">${cpu}</td>
      <td class="${(p.memory_percent||0) > ALERT_MEM ? 'mem-high' : ''}">${mem}</td>
      <td><span class="tag ${status}">${status}</span></td>
      <td>${formatCreateTime(p.create_time)}</td>
      <td>
        <div class="process-actions">
          <button class="btn-xs" onclick="viewInfo(${pid})">Info</button>
          <button class="btn-xs" onclick="onKillClicked(${pid})">Kill</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ---------- charts ---------- */
function initChartsIfNeeded() {
  if (cpuChart && memChart) return;

  const cpuCtx = document.getElementById("cpuChart").getContext("2d");
  const memCtx = document.getElementById("memChart").getContext("2d");

  cpuChart = new Chart(cpuCtx, {
    type: "line",
    data: { labels: Array(60).fill(""), datasets: [{ label: "CPU %", data: cpuHistory, tension: 0.2 }] },
    options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } }
  });

  memChart = new Chart(memCtx, {
    type: "line",
    data: { labels: Array(60).fill(""), datasets: [{ label: "Mem %", data: memHistory, tension: 0.2 }] },
    options: { animation: false, responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { suggestedMin: 0, suggestedMax: 100 } } }
  });
}

function updateCharts(data) {
  initChartsIfNeeded();
  const cpu = typeof data.cpu_usage === "number" ? data.cpu_usage : 0;
  const mem = typeof data.memory_usage === "number" ? data.memory_usage : 0;

  cpuHistory.push(cpu);
  memHistory.push(mem);
  if (cpuHistory.length > 60) cpuHistory.shift();
  if (memHistory.length > 60) memHistory.shift();

  cpuChart.data.datasets[0].data = cpuHistory;
  memChart.data.datasets[0].data = memHistory;
  cpuChart.update();
  memChart.update();
}

/* ---------- actions ---------- */
function viewInfo(pid) {
  const p = processesCache.find(x => x.pid === pid);
  if (!p) return alert("Process not found in current data.");
  const msg = `PID: ${p.pid}\nName: ${p.name}\nUser: ${p.username || 'system'}\nCPU: ${(p.cpu_percent||0).toFixed(1)}%\nMem: ${(p.memory_percent||0).toFixed(1)}%\nStarted: ${formatCreateTime(p.create_time)}`;
  alert(msg);
}

function onKillClicked(pid) {
  // simple browser confirm — not a stuck modal
  if (!confirm(`Kill process ${pid}?`)) return;
  killProcess(pid);
}

async function killProcess(pid) {
  try {
    const res = await fetch(`${API_URL}/kill/${pid}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      alert(`Kill failed: ${res.status} ${body}`);
    } else {
      // refresh immediately
      fetchAndRender();
    }
  } catch (err) {
    alert("Network error while trying to kill process.");
    console.warn(err);
  }
}

/* ---------- auto-refresh ---------- */
function startAutoRefresh() {
  stopAutoRefresh();
  intervalId = setInterval(() => {
    if (autoRefresh) fetchAndRender();
  }, 2000);
}

function stopAutoRefresh() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

/* ---------- small helpers ---------- */
function formatCreateTime(epochSeconds) {
  if (!epochSeconds) return "--";
  // if create_time is in seconds or floating; if in millis, try to detect
  let t = epochSeconds;
  if (epochSeconds > 1e12) t = Math.floor(epochSeconds / 1000); // likely ms
  const d = new Date(t * 1000);
  return d.toLocaleString();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}

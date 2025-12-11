const API_URL = "http://127.0.0.1:5000";

let autoRefresh = true;
let cpuHistory = [];
let memHistory = [];

document.addEventListener("DOMContentLoaded", () => {
  loadStats();
  setInterval(() => {
    if (autoRefresh) loadStats();
  }, 2000);

  document.getElementById("refreshBtn").addEventListener("click", loadStats);

  document
    .getElementById("autoRefreshToggle")
    .addEventListener("change", (e) => {
      autoRefresh = e.target.checked;
    });
});

async function loadStats() {
  try {
    const res = await fetch(`${API_URL}/stats`);
    const data = await res.json();

    updateSummary(data);
    updateProcessTable(data.processes);
    updateCharts(data);

    setStatus("Connected");
  } catch (err) {
    setStatus("Disconnected");
  }
}

function setStatus(text) {
  document.getElementById("connectionStatus").innerText = text;
  document.getElementById("lastUpdated").innerText = new Date()
    .toLocaleTimeString();
}

function updateSummary(data) {
  const { cpu_usage, memory_usage, processes } = data;

  document.getElementById("cpuUsageValue").innerText = cpu_usage + "%";
  document.getElementById("memUsageValue").innerText = memory_usage + "%";

  document.getElementById("processCount").innerText = processes.length;

  const running = processes.filter((p) => p.status === "running").length;
  const sleeping = processes.filter((p) => p.status === "sleeping").length;
  const stopped = processes.filter((p) => p.status === "stopped").length;

  document.getElementById("runningCount").innerText = running;
  document.getElementById("sleepingCount").innerText = sleeping;
  document.getElementById("stoppedCount").innerText = stopped;

  let alerts = processes.filter(
    (p) => p.cpu_percent > 80 || p.memory_percent > 80
  );

  document.getElementById("alertCount").innerText = alerts.length;

  document.getElementById("alertList").innerHTML = alerts
    .map(
      (p) =>
        `<li>${p.name} (PID: ${p.pid}) – CPU: ${p.cpu_percent}% MEM: ${p.memory_percent}%</li>`
    )
    .join("");

  document.getElementById("cpuUsageBar").style.width = cpu_usage + "%";
  document.getElementById("memUsageBar").style.width = memory_usage + "%";
}

function updateProcessTable(processes) {
  let rows = "";

  processes.forEach((p) => {
    rows += `
      <tr>
        <td>${p.pid}</td>
        <td>${p.name}</td>
        <td>system</td>
        <td>${p.cpu_percent}</td>
        <td>${p.memory_percent}</td>
        <td>${p.status}</td>
        <td>--</td>
        <td>
          <button class="kill-btn" onclick="killProcess(${p.pid})">
            Kill
          </button>
        </td>
      </tr>
    `;
  });

  document.getElementById("processTableBody").innerHTML = rows;
}

async function killProcess(pid) {
  if (!confirm(`Kill process ${pid}?`)) return;

  await fetch(`${API_URL}/kill/${pid}`, {
    method: "POST",
  });

  loadStats();
}

// Charts
let cpuChart, memChart;

function updateCharts(data) {
  cpuHistory.push(data.cpu_usage);
  memHistory.push(data.memory_usage);

  if (cpuHistory.length > 60) cpuHistory.shift();
  if (memHistory.length > 60) memHistory.shift();

  if (!cpuChart) initCharts();

  cpuChart.data.datasets[0].data = cpuHistory;
  cpuChart.update();

  memChart.data.datasets[0].data = memHistory;
  memChart.update();
}

function initCharts() {
  const ctx1 = document.getElementById("cpuChart").getContext("2d");
  const ctx2 = document.getElementById("memChart").getContext("2d");

  cpuChart = new Chart(ctx1, {
    type: "line",
    data: {
      labels: Array(60).fill(""),
      datasets: [{ label: "CPU %", data: cpuHistory }]
    }
  });

  memChart = new Chart(ctx2, {
    type: "line",
    data: {
      labels: Array(60).fill(""),
      datasets: [{ label: "Mem %", data: memHistory }]
    }
  });
}

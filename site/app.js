const STORAGE = {
  email: "yh_manager_email",
  token: "yh_gas_token",
};

const config = window.SITE_CONFIG;

function allowed(email) {
  return config.allowedEmails.includes(String(email).trim().toLowerCase());
}

function gasGet(action, params) {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem(STORAGE.token) || "";
    const cb = "gas_cb_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const url = new URL(config.gasUrl);
    url.searchParams.set("action", action);
    url.searchParams.set("token", token);
    url.searchParams.set("callback", cb);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
    });

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("連線逾時"));
    }, 25000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      script.remove();
    }

    window[cb] = (payload) => {
      cleanup();
      resolve(payload);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("無法連線 GAS"));
    };
    script.src = url.toString();
    document.body.appendChild(script);
  });
}

function show(view) {
  document.getElementById("login-view").classList.toggle("hidden", view !== "login");
  document.getElementById("app-view").classList.toggle("hidden", view !== "app");
}

function setMessage(text) {
  document.getElementById("login-msg").textContent = text || "";
}

async function enter() {
  const email = document.getElementById("email").value.trim().toLowerCase();
  const token = document.getElementById("token").value.trim();
  if (!allowed(email)) {
    setMessage("此帳號未授權。請使用 yongheelderly0826@gmail.com");
    return;
  }
  if (!token) {
    setMessage("請貼上 GAS API Token（與本機 .env.local 相同）");
    return;
  }
  localStorage.setItem(STORAGE.email, email);
  localStorage.setItem(STORAGE.token, token);
  await loadApp();
}

async function loadApp() {
  const email = localStorage.getItem(STORAGE.email);
  if (!email || !allowed(email) || !localStorage.getItem(STORAGE.token)) {
    show("login");
    return;
  }
  show("app");
  document.getElementById("who").textContent = email;
  document.getElementById("sheet-link").href = config.spreadsheetUrl;

  try {
    const [kpiRes, caseRes] = await Promise.all([
      gasGet("reports.kpi", { period: "115" }),
      gasGet("cases.list", { district: "永和區" }),
    ]);
    if (!kpiRes.ok) throw new Error(kpiRes.error?.message || "KPI 讀取失敗");
    if (!caseRes.ok) throw new Error(caseRes.error?.message || "名冊讀取失敗");

    const kpi = kpiRes.data || {};
    const cases = caseRes.data || [];
    document.getElementById("m-cases").textContent = String(cases.length);
    document.getElementById("m-assign").textContent = String(kpi.total_assignments ?? 0);
    document.getElementById("m-rate").textContent = (kpi.completion_rate ?? 0) + "%";
    document.getElementById("m-miss").textContent = String(kpi.missed ?? 0);

    const body = document.getElementById("case-body");
    body.innerHTML = cases
      .slice(0, 80)
      .map(
        (row) =>
          `<tr>
            <td>${escapeHtml(row.external_id || row.case_id || "")}</td>
            <td>${escapeHtml(row.name || "")}</td>
            <td>${escapeHtml(row.case_type || "")}</td>
            <td>${escapeHtml(row.visit_village || "")}</td>
            <td>${escapeHtml(row.visit_status || "")}</td>
          </tr>`,
      )
      .join("");
  } catch (err) {
    document.getElementById("app-msg").textContent =
      err.message + "。請確認 Token，或直接開啟試算表。";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function logout() {
  localStorage.removeItem(STORAGE.email);
  show("login");
}

document.getElementById("email").value =
  localStorage.getItem(STORAGE.email) || "yongheelderly0826@gmail.com";
document.getElementById("token").value = localStorage.getItem(STORAGE.token) || "";
document.getElementById("enter").addEventListener("click", () => void enter());
document.getElementById("logout").addEventListener("click", logout);

if (localStorage.getItem(STORAGE.email) && localStorage.getItem(STORAGE.token)) {
  void loadApp();
} else {
  show("login");
}

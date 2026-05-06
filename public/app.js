const TOKEN_KEY = "logitecAccessToken";
const USER_KEY = "logitecUser";

const app = document.getElementById("app");
let activeSection = "Dashboard";

const navItems = ["Dashboard", "Users", "Inventory", "System Status"];

const statusItems = [
  { name: "Backend", value: "Online", tone: "ok" },
  { name: "Auth", value: "Active", tone: "ok" },
  { name: "Inventory", value: "In progress", tone: "warn" },
  { name: "Integration", value: "Pending", tone: "pending" }
];

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(accessToken, user) {
  localStorage.setItem(TOKEN_KEY, accessToken);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function login(email, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.message || "Unable to login with provided credentials.";
    throw new Error(message);
  }

  return payload;
}

async function fetchUsers() {
  const token = getToken();
  if (!token) return [];

  const response = await fetch("/api/users", {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!response.ok) {
    return [];
  }

  return response.json();
}

function renderLogin() {
  app.innerHTML = `
    <main class="page">
      <section class="card">
        <h1 class="brand">Logitec Control</h1>
        <p class="subtitle">Secure operational dashboard preview</p>
        <form id="loginForm">
          <label class="label" for="email">Email</label>
          <input class="input" id="email" type="email" placeholder="you@company.com" required />
          <label class="label" for="password">Password</label>
          <input class="input" id="password" type="password" placeholder="••••••••" required />
          <p class="error" id="loginError"></p>
          <button class="btn" id="submitBtn" type="submit">Sign in</button>
        </form>
      </section>
    </main>
  `;

  const form = document.getElementById("loginForm");
  const errorLabel = document.getElementById("loginError");
  const submitBtn = document.getElementById("submitBtn");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorLabel.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      const result = await login(email, password);
      saveSession(result.accessToken, result.user);
      renderDashboard(result.user);
    } catch (error) {
      errorLabel.textContent =
        error instanceof Error ? error.message : "Unexpected login error.";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign in";
    }
  });
}

function renderUsersList(users) {
  if (!users.length) {
    return `<p class="placeholder">User list will appear here for ADMIN role or when API access is available.</p>`;
  }

  const rows = users
    .map(
      (user) => `
      <div class="status-row">
        <span>${user.fullName}</span>
        <span class="dot pending">${user.role}</span>
      </div>
    `
    )
    .join("");

  return rows;
}

function buildPanelContent(section, usersMarkup) {
  if (section === "Users") {
    return `
      <section class="panel">
        <h3>Users</h3>
        ${usersMarkup}
      </section>
    `;
  }

  if (section === "Inventory") {
    return `
      <section class="panel">
        <h3>Inventory</h3>
        <p class="placeholder">Inventory module preview. Operational cards and stock flows will be connected in next phase.</p>
      </section>
    `;
  }

  if (section === "System Status") {
    return `
      <section class="panel">
        <h3>System Status</h3>
        ${statusItems
          .map(
            (item) => `
          <div class="status-row">
            <span>${item.name}</span>
            <span class="dot ${item.tone}">${item.value}</span>
          </div>
        `
          )
          .join("")}
      </section>
    `;
  }

  return `
    <section class="panel">
      <h3>Dashboard</h3>
      <p class="placeholder">This preview highlights authentication, role visibility, and overall platform readiness.</p>
    </section>
    <section class="panel">
      <h3>System Status</h3>
      ${statusItems
        .map(
          (item) => `
        <div class="status-row">
          <span>${item.name}</span>
          <span class="dot ${item.tone}">${item.value}</span>
        </div>
      `
        )
        .join("")}
    </section>
  `;
}

async function renderDashboard(user) {
  const users = user.role === "ADMIN" ? await fetchUsers() : [];
  const usersMarkup = renderUsersList(users);

  app.innerHTML = `
    <div class="dashboard">
      <aside class="sidebar">
        <h2>Logitec Control</h2>
        <nav class="nav">
          ${navItems
            .map(
              (item) => `
              <button class="nav-item ${item === activeSection ? "active" : ""}" data-nav="${item}">${item}</button>
            `
            )
            .join("")}
        </nav>
      </aside>
      <main class="main">
        <header class="top">
          <div>
            <h1 class="welcome">Welcome, ${user.fullName}</h1>
            <small class="subtitle">Operational preview environment</small>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <span class="role-badge">${user.role}</span>
            <button class="logout" id="logoutBtn" type="button">Logout</button>
          </div>
        </header>
        <section class="panel-grid">
          ${buildPanelContent(activeSection, usersMarkup)}
        </section>
      </main>
    </div>
  `;

  app.querySelectorAll("[data-nav]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSection = button.dataset.nav;
      renderDashboard(user);
    });
  });

  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearSession();
    activeSection = "Dashboard";
    renderLogin();
  });
}

function init() {
  const token = getToken();
  const user = getUser();

  if (token && user) {
    renderDashboard(user);
    return;
  }

  renderLogin();
}

init();

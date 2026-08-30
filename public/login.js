function redirectApexLoginToWww() {
  if (window.location.hostname !== "control.logitec.com.mx") return false;
  window.location.replace(
    "https://www.control.logitec.com.mx" + window.location.pathname + window.location.search + window.location.hash
  );
  return true;
}

if (redirectApexLoginToWww()) {
  /* Stay on www before reading or sending credentials. */
}

// Mantener alineado con ACTIVE_NAV_STORAGE_KEY en dashboard.js (se limpia en cada login nuevo).
const ACTIVE_NAV_STORAGE_KEY = "logitec_active_nav";
const REMEMBERED_EMAIL_KEY = "logitec_remembered_email";

const form = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");
const submitBtn = document.getElementById("submitBtn");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberEmail = document.getElementById("rememberEmail");
const clearRememberedEmailBtn = document.getElementById("clearRememberedEmailBtn");

function readRememberedEmail() {
  try {
    return String(localStorage.getItem(REMEMBERED_EMAIL_KEY) || "").trim();
  } catch (_error) {
    return "";
  }
}

function persistRememberedEmail(email) {
  try {
    const value = String(email || "").trim().toLowerCase();
    if (!value) localStorage.removeItem(REMEMBERED_EMAIL_KEY);
    else localStorage.setItem(REMEMBERED_EMAIL_KEY, value);
  } catch (_error) {
    /* ignore private mode */
  }
}

function clearRememberedEmail() {
  persistRememberedEmail("");
  if (rememberEmail) rememberEmail.checked = false;
  if (emailInput) {
    emailInput.value = "";
    emailInput.focus();
  }
}

function applyRememberedEmail() {
  const saved = readRememberedEmail();
  if (saved && emailInput) emailInput.value = saved;
  if (rememberEmail) rememberEmail.checked = Boolean(saved);
}

function clearStoredNavRouteAfterLogin() {
  try {
    sessionStorage.removeItem(ACTIVE_NAV_STORAGE_KEY);
  } catch (_error) {
    /* ignore private mode */
  }
}

applyRememberedEmail();
clearRememberedEmailBtn?.addEventListener("click", () => {
  clearRememberedEmail();
  if (passwordInput) passwordInput.value = "";
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (redirectApexLoginToWww()) return;

  errorMessage.textContent = "";
  submitBtn.disabled = true;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    const token = data.token || data.accessToken;

    if (!response.ok || !token) {
      errorMessage.textContent = data.message || "No fue posible iniciar sesion.";
      submitBtn.disabled = false;
      return;
    }

    if (rememberEmail?.checked) persistRememberedEmail(email);
    else persistRememberedEmail("");

    clearStoredNavRouteAfterLogin();
    localStorage.setItem("token", token);
    window.location.href = "/dashboard.html";
  } catch (_error) {
    errorMessage.textContent = "Error de red. Intenta nuevamente.";
    submitBtn.disabled = false;
  }
});

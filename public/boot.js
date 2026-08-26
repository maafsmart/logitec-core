const redirectedToCanonicalWww = window.location.hostname === "control.logitec.com.mx";
if (redirectedToCanonicalWww) {
  window.location.replace(
    "https://www.control.logitec.com.mx" + window.location.pathname + window.location.search + window.location.hash
  );
}

const statusText = document.getElementById("statusText");
const token = localStorage.getItem("token");

function nextRoute() {
  if (token) {
    window.location.replace("/dashboard.html");
    return;
  }
  window.location.replace("/login.html");
}

/** Render/planos de Render pueden responder 200 con HTML; solo confiar en JSON real del API. */
async function healthLooksReady(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/json")) {
    return false;
  }
  try {
    const data = await response.json();
    return Boolean(data && data.ok === true);
  } catch (_err) {
    return false;
  }
}

function pauseForAttempt(attempt) {
  // Primeros intentos más seguidos: el servicio suele levantar en 10–40 s en cold start.
  if (attempt <= 20) return 900;
  if (attempt <= 35) return 1800;
  return 2800;
}

async function wakeService() {
  const maxAttempts = 55;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      statusText.textContent = `Conectando con el sistema… intento ${attempt}/${maxAttempts}`;
      const response = await fetch("/health", {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (await healthLooksReady(response)) {
        statusText.textContent = "Listo. Abriendo panel…";
        setTimeout(nextRoute, 300);
        return;
      }
    } catch (_error) {
      // Red fría o servicio aún no acepta conexiones.
    }

    await new Promise((resolve) => setTimeout(resolve, pauseForAttempt(attempt)));
  }

  statusText.textContent = "Sigue tardando. Te llevamos al login; si falla, intenta de nuevo en unos segundos.";
  setTimeout(nextRoute, 900);
}

if (!redirectedToCanonicalWww) {
  wakeService();
}

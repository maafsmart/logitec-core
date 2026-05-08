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

async function wakeService() {
  const maxAttempts = 45;
  const pauseMs = 2500;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      statusText.textContent = `Iniciando servicio... intento ${attempt}/${maxAttempts}`;
      const response = await fetch("/health", {
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (await healthLooksReady(response)) {
        statusText.textContent = "Servicio activo, redirigiendo...";
        setTimeout(nextRoute, 350);
        return;
      }
    } catch (_error) {
      // Red fría o servicio aún no levanta.
    }

    await new Promise((resolve) => setTimeout(resolve, pauseMs));
  }

  statusText.textContent = "Tardó más de lo esperado. Redirigiendo al login o al panel...";
  setTimeout(nextRoute, 700);
}

wakeService();

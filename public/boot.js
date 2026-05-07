const statusText = document.getElementById("statusText");
const token = localStorage.getItem("token");

function nextRoute() {
  if (token) {
    window.location.replace("/dashboard.html");
    return;
  }
  window.location.replace("/login.html");
}

async function wakeService() {
  for (let attempt = 1; attempt <= 15; attempt += 1) {
    try {
      statusText.textContent = `Iniciando servicio... intento ${attempt}/15`;
      const response = await fetch("/health", { cache: "no-store" });
      if (response.ok) {
        statusText.textContent = "Servicio activo, redirigiendo...";
        setTimeout(nextRoute, 350);
        return;
      }
    } catch (_error) {
      // Expected during cold start.
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  statusText.textContent = "Tardo mas de lo esperado. Redirigiendo...";
  setTimeout(nextRoute, 700);
}

wakeService();

const form = document.getElementById("pairForm");
const challenge = document.getElementById("challengeId");
const secret = document.getElementById("pairSecret");
const status = document.getElementById("pairStatus");

// Pairing data is accepted only from form/QR scanner input, never from URL state.
history.replaceState(null, "", "/pda-pair.html");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  status.textContent = "Validando emparejamiento…";
  const body = {
    challengeId: String(challenge.value || "").trim(),
    secret: String(secret.value || "").trim()
  };
  secret.value = "";
  try {
    const response = await fetch("/api/pda/pair/exchange", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      referrerPolicy: "no-referrer"
    });
    body.secret = "";
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Error HTTP ${response.status}`);
    challenge.value = "";
    status.textContent = `Emparejado para ${data.testId}. Abriendo laboratorio…`;
    history.replaceState(null, "", "/pda-pair.html");
    window.location.replace(data.next || "/pda-scanner-lab.html");
  } catch (error) {
    body.secret = "";
    status.textContent = error.message || "No se pudo emparejar.";
    button.disabled = false;
    secret.focus();
  }
});

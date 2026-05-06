const form = document.getElementById("loginForm");
const errorMessage = document.getElementById("errorMessage");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorMessage.textContent = "";
  submitBtn.disabled = true;

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

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

    localStorage.setItem("token", token);
    window.location.href = "/dashboard.html";
  } catch (_error) {
    errorMessage.textContent = "Error de red. Intenta nuevamente.";
    submitBtn.disabled = false;
  }
});

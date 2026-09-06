(function logitecInstallPage() {
  "use strict";

  const installBtn = document.getElementById("installBtn");
  const standalonePanel = document.getElementById("standalonePanel");
  const successPanel = document.getElementById("successPanel");
  const manualPanel = document.getElementById("manualPanel");
  let deferredPrompt = null;
  let installPromptSeen = false;

  function isPwaStandalone() {
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches ||
      window.matchMedia("(display-mode: window-controls-overlay)").matches ||
      window.navigator.standalone === true
    );
  }

  function show(el) {
    if (!el) return;
    el.hidden = false;
    el.classList.remove("hidden");
  }

  function hide(el) {
    if (!el) return;
    el.hidden = true;
    el.classList.add("hidden");
  }

  function syncInstallUi() {
    hide(installBtn);
    hide(standalonePanel);
    hide(successPanel);
    hide(manualPanel);

    if (isPwaStandalone()) {
      show(standalonePanel);
      return;
    }
    if (deferredPrompt) {
      show(installBtn);
      return;
    }
    if (installPromptSeen) {
      show(manualPanel);
    }
  }

  if (isPwaStandalone()) {
    syncInstallUi();
  } else {
    window.setTimeout(() => {
      if (!deferredPrompt && !isPwaStandalone()) {
        installPromptSeen = true;
        syncInstallUi();
      }
    }, 2500);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installPromptSeen = true;
    syncInstallUi();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hide(installBtn);
    hide(manualPanel);
    show(successPanel);
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    hide(installBtn);
    if (choice?.outcome === "accepted") {
      show(successPanel);
    } else {
      show(manualPanel);
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/logitec-role-demo-sw.js", { scope: "/" }).catch(() => {});
  }
})();

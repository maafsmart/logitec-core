const byId = (id) => document.getElementById(id);
const activeGrantMarkerKey = "logitec:pda:active-grant";
let stream = null;
let detector = null;
let timer = null;
let busy = false;

function consumeFragment() {
  const fragment = window.location.hash.slice(1);
  history.replaceState(null, "", "/pda-pair.html");
  if (!fragment) return false;
  const value = fragment.startsWith("p=") ? fragment.slice(2) : fragment;
  try {
    byId("pairingCode").value = decodeURIComponent(value);
  } catch {
    byId("pairingCode").value = "";
    return false;
  }
  return true;
}

function parsePairingCode(raw) {
  const value = String(raw || "").trim();
  if (value.startsWith("LOGITEC-PDA1:")) {
    const payload = value.slice("LOGITEC-PDA1:".length);
    const separator = payload.indexOf(".");
    if (separator < 1) throw new Error("QR de emparejamiento inválido.");
    return {
      pairingId: payload.slice(0, separator),
      secret: payload.slice(separator + 1),
      mode: "QR"
    };
  }
  const separator = value.indexOf(".");
  if (separator < 1) throw new Error("Código manual incompleto.");
  return {
    pairingId: value.slice(0, separator).trim(),
    secret: value.slice(separator + 1).replaceAll("-", "").trim(),
    mode: "MANUAL"
  };
}

async function exchange() {
  const button = byId("exchangeBtn");
  button.disabled = true;
  try {
    const payload = parsePairingCode(byId("pairingCode").value);
    byId("pairingCode").value = "";
    const response = await fetch("/api/pda/pairings/exchange", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Error HTTP ${response.status}`);
    try {
      localStorage.setItem(activeGrantMarkerKey, data.grant.publicId);
    } catch {
      throw new Error("No se pudo registrar el grant local; emparejamiento UNVERIFIABLE.");
    }
    stopCamera();
    window.location.replace("/pda-scanner-lab.html");
  } catch (error) {
    byId("pairingStatus").textContent = error.message;
    button.disabled = false;
  }
}

async function loadDetector() {
  if (window.BarcodeDetector) return new window.BarcodeDetector({ formats: ["qr_code"] });
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "/vendor/barcode-detector/3.2.2/polyfill.js";
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
  const prepare = window.BarcodeDetectionAPI?.prepareZXingModule;
  if (prepare) {
    await prepare({ overrides: { locateFile: (path, prefix) =>
      path.endsWith(".wasm") ? "/vendor/zxing-wasm/3.1.3/zxing_reader.wasm" : `${prefix}${path}` } });
  }
  return new window.BarcodeDetector({ formats: ["qr_code"] });
}

function stopCamera() {
  if (timer) clearTimeout(timer);
  timer = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  byId("cameraVideo").srcObject = null;
  byId("pairCamera").hidden = true;
  byId("stopCameraBtn").hidden = true;
  byId("cameraBtn").disabled = false;
}

async function detectQr() {
  if (!stream || busy) return;
  busy = true;
  try {
    const detections = await detector.detect(byId("cameraVideo"));
    const value = String(detections?.[0]?.rawValue || "");
    if (value.startsWith("LOGITEC-PDA1:")) {
      byId("pairingCode").value = value;
      stopCamera();
      await exchange();
      return;
    }
  } catch {
    byId("pairingStatus").textContent = "Buscando QR…";
  } finally {
    busy = false;
  }
  if (stream) timer = setTimeout(() => void detectQr(), 180);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    byId("pairingStatus").textContent = "Cámara no disponible; usa el código manual.";
    return;
  }
  byId("cameraBtn").disabled = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } }
    });
    byId("cameraVideo").srcObject = stream;
    await byId("cameraVideo").play();
    detector ||= await loadDetector();
    byId("pairCamera").hidden = false;
    byId("stopCameraBtn").hidden = false;
    byId("pairingStatus").textContent = "Apunta al QR mostrado en la estación ADMIN.";
    void detectQr();
  } catch {
    stopCamera();
    byId("pairingStatus").textContent = "No se pudo abrir la cámara; usa el código manual.";
  }
}

const oneClickInvitation = consumeFragment();
try {
  byId("preexistingWarning").hidden = localStorage.getItem("token") === null;
} catch {
  byId("preexistingWarning").hidden = false;
}
byId("exchangeBtn").addEventListener("click", () => void exchange());
byId("cameraBtn").addEventListener("click", () => void startCamera());
byId("stopCameraBtn").addEventListener("click", stopCamera);
window.addEventListener("pagehide", stopCamera);
if (oneClickInvitation) void exchange();

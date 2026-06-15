/**
 * Cloudflare Worker: responde al instante en GET / con la carátula Logitec
 * y reenvía el resto al Web Service en Render (despierta el cold start en segundo plano).
 *
 * Despliegue: Wrangler (`npx wrangler deploy`) o Dashboard de Cloudflare.
 * Variable de entorno en el Worker: ORIGIN_URL = https://tu-servicio.onrender.com
 *
 * DNS: CNAME de control.logitec.com.mx → <worker>.workers.dev (o ruta custom del Worker).
 */
const SHELL_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Logitec | Inicializando</title>
<style>
:root{--bg:#0b1222;--line:#2a3b63;--text:#eaf0ff;--muted:#9caacc}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;font-family:Inter,Segoe UI,Arial,sans-serif;color:var(--text);background:radial-gradient(circle at top,#12244a 0%,var(--bg) 55%)}
.card{width:min(480px,100%);border:1px solid var(--line);border-radius:14px;background:rgba(17,28,52,.95);padding:24px}
h1{margin:0 0 8px;font-size:1.35rem}
p{margin:0 0 14px;color:var(--muted)}
.loader{height:8px;width:100%;border-radius:999px;overflow:hidden;background:#1a2950}
.loader>span{display:block;height:100%;width:32%;background:#76a7ff;animation:move 1.2s ease-in-out infinite}
.status{margin-top:10px;color:var(--muted);font-size:.92rem}
@keyframes move{0%{transform:translateX(-130%)}100%{transform:translateX(360%)}}
</style>
</head>
<body>
<main class="card">
<h1>Logitec WMS</h1>
<p>Iniciando sistema en la nube…</p>
<div class="loader"><span></span></div>
<div id="statusText" class="status">Conectando con API…</div>
</main>
<script>
(function(){
var statusText=document.getElementById("statusText");
var token=localStorage.getItem("token");
function nextRoute(){if(token){location.replace("/dashboard.html");return;}location.replace("/login.html");}
async function healthOk(r){
  var ct=r.headers.get("content-type")||"";
  if(!r.ok||!ct.includes("application/json"))return false;
  try{var d=await r.json();return !!(d&&d.ok===true);}catch(_){return false;}
}
function pause(n){return n<=20?900:n<=35?1800:2800;}
async function wake(){
  var max=55,i,t;
  for(i=1;i<=max;i++){
    try{
      statusText.textContent="Conectando con el sistema… intento "+i+"/"+max;
      var res=await fetch("/health",{cache:"no-store",headers:{Accept:"application/json"}});
      var clone=res.clone();
      if(await healthOk(clone)){statusText.textContent="Listo. Abriendo panel…";setTimeout(nextRoute,300);return;}
    }catch(_){}
    t=pause(i);
    await new Promise(function(r){setTimeout(r,t);});
  }
  statusText.textContent="Sigue tardando. Te llevamos al login; si falla, intenta de nuevo.";
  setTimeout(nextRoute,900);
}
wake();
})();
</script>
</body>
</html>`;

function stripHopHeaders(headers) {
  const drop = new Set([
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailers",
    "upgrade",
    "host"
  ]);
  const out = new Headers();
  for (const [k, v] of headers) {
    if (!drop.has(k.toLowerCase())) out.append(k, v);
  }
  return out;
}

export default {
  async fetch(request, env) {
    const originBase = env.ORIGIN_URL;
    if (!originBase || typeof originBase !== "string") {
      return new Response("Worker: falta secreto ORIGIN_URL (URL del servicio Render).", {
        status: 500,
        headers: { "Content-Type": "text/plain;charset=UTF-8" }
      });
    }

    const url = new URL(request.url);
    const path = url.pathname === "/" || url.pathname === "" ? "/" : url.pathname;

    if (request.method === "GET" && (path === "/" || path === "/index.html")) {
      return new Response(SHELL_HTML, {
        headers: {
          "Content-Type": "text/html; charset=UTF-8",
          "Cache-Control": "no-store"
        }
      });
    }

    let upstream;
    try {
      upstream = new URL(path + url.search, originBase.replace(/\/$/, "") + "/");
    } catch {
      return new Response("URL de origen inválida.", { status: 500 });
    }

    const outHeaders = stripHopHeaders(request.headers);
    outHeaders.set("Host", upstream.host);

    const init = {
      method: request.method,
      headers: outHeaders,
      redirect: "follow"
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    return fetch(upstream.toString(), init);
  }
};

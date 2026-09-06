import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/logitec-role-demo.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/logitec-role-demo.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/logitec-role-demo.css", import.meta.url), "utf8");
const manifest = readFileSync(new URL("../public/manifest.webmanifest", import.meta.url), "utf8");
const sw = readFileSync(new URL("../public/logitec-role-demo-sw.js", import.meta.url), "utf8");
const installHtml = readFileSync(new URL("../public/install.html", import.meta.url), "utf8");
const installJs = readFileSync(new URL("../public/install.js", import.meta.url), "utf8");

test("cache buster v16.2.7", () => {
  assert.match(html, /logitec-role-demo\.js\?v=16\.2\.7/);
  assert.match(html, /logitec-role-demo\.css\?v=16\.2\.7/);
});

test("PWA manifest instalable LOGITEC CORE WMS", () => {
  const parsed = JSON.parse(manifest) as {
    id: string;
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    scope: string;
    theme_color: string;
    icons: Array<{ src: string; sizes: string }>;
  };
  assert.equal(parsed.id, "/logitec-core-wms");
  assert.equal(parsed.name, "LOGITEC CORE WMS");
  assert.equal(parsed.short_name, "LOGITEC WMS");
  assert.equal(parsed.display, "standalone");
  assert.equal(parsed.start_url, "/logitec-role-demo.html");
  assert.equal(parsed.scope, "/");
  assert.equal(parsed.theme_color, "#1075bd");
  assert.ok(parsed.icons.some((icon) => icon.src.includes("192")));
  assert.ok(parsed.icons.some((icon) => icon.src.includes("512")));
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(html, /meta name="theme-color" content="#1075bd"/);
});

test("install.html usa JS externo sin CSP inline", () => {
  assert.doesNotMatch(installHtml, /Abrir aplicaci[oó]n/i);
  assert.doesNotMatch(installHtml, /Copiar URL/i);
  assert.doesNotMatch(installHtml, /Iniciar sesi[oó]n/i);
  assert.match(installHtml, /INSTALAR LOGITEC CORE WMS/);
  assert.match(installHtml, /<script src="\/install\.js" defer><\/script>/);
  assert.doesNotMatch(installHtml, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/);
  assert.match(installJs, /function isPwaStandalone\(\)/);
  assert.match(installJs, /beforeinstallprompt/);
  assert.match(installJs, /appinstalled/);
  assert.match(installHtml, /se instal[oó] correctamente/i);
  assert.match(installJs, /2500/);
});

test("detección standalone y registro SW con scope", () => {
  assert.match(js, /function isPwaStandalone\(\)/);
  assert.match(js, /display-mode: standalone/);
  assert.match(js, /display-mode: minimal-ui/);
  assert.match(js, /OFFICIAL_APP \? "\/app-sw\.js" : "\/logitec-role-demo-sw\.js"/);
  assert.match(installJs, /register\("\/logitec-role-demo-sw\.js", \{ scope: "\/" \}\)/);
});

test("service worker mínimo no cachea APIs", () => {
  assert.match(sw, /\/api\//);
  assert.match(sw, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return;/);
  assert.match(sw, /if \(url\.pathname\.startsWith\("\/login"\)\) return;/);
  assert.match(js, /logitec-role-demo-sw\.js/);
  assert.match(js, /app-sw\.js/);
});

test("Director oculto salvo ?director=1 en localhost", () => {
  assert.match(js, /function isDirectorViewSwitchEnabled\(\)/);
  assert.match(js, /get\("director"\) === "1"/);
  assert.match(js, /function syncDirectorReviewChrome\(\)/);
  assert.match(css, /body:not\(\.director-review-active\) #directorViewBar/);
  assert.match(css, /body:not\(\.director-review-active\) \.demo-readonly-footer/);
  assert.match(html, /id="demoEnvBadge"/);
});

test("app shell install y pantalla completa opcional", () => {
  assert.match(html, /id="pwaInstallBtn"[^>]*>Instalar LOGITEC CORE WMS/);
  assert.match(html, /id="fullscreenBtn"/);
  assert.match(js, /beforeinstallprompt/);
  assert.match(js, /requestFullscreen/);
  assert.match(installHtml, /Instalar LOGITEC CORE WMS/);
  assert.match(installHtml, /manifest\.webmanifest/);
});

test("drawer lateral reutilizado y entidades conectadas", () => {
  assert.match(html, /id="gridDetailDrawer"/);
  assert.match(js, /function openDetailDrawer\(/);
  assert.match(js, /function closeDetailDrawer\(/);
  assert.match(js, /function wireDetailDrawer\(/);
  assert.match(js, /detailRowAttrs\("stock"/);
  assert.match(js, /detailRowAttrs\("product"/);
  assert.match(js, /detailRowAttrs\("location"/);
  assert.match(js, /detailRowAttrs\("project"/);
  assert.match(js, /detailRowAttrs\("movement"/);
  assert.match(css, /\.grid-detail-drawer/);
  assert.match(css, /@media \(max-width: 640px\)[\s\S]*\.grid-detail-panel/);
});

test("role switch solo en modo Director", () => {
  assert.match(html, /id="sessionRoleBadge"/);
  assert.match(js, /function sessionRoleLabel\(\)/);
  assert.match(js, /roleSwitch\.hidden = !directorReview/);
  assert.match(js, /roleBadge\.hidden = directorReview/);
  assert.match(js, /if \(!isDirectorViewSwitchEnabled\(\)\) return;\s*\n\s*applyRoleView\(role\)/);
  assert.match(css, /body:not\(\.director-review-active\) #roleSwitch/);
  assert.match(css, /body\.director-review-active #sessionRoleBadge/);
});

test("POL-004 no mezcla fuentes en applyExcelPayload", () => {
  assert.match(js, /POL-004 · fuentes documentales separadas/);
  assert.match(js, /22-jun-2026 vs inventario oficial 14-ago-2026/);
});

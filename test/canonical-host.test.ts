import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("../public/canonical-host.js", import.meta.url), "utf8");
const loginJs = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");
const bootJs = readFileSync(new URL("../public/boot.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const loginHtml = readFileSync(new URL("../public/login.html", import.meta.url), "utf8");
const dashboardHtml = readFileSync(new URL("../public/dashboard.html", import.meta.url), "utf8");

new Function(source)();
const api = globalThis.LogitecCanonicalHost;

function fakeLocation(hostname, pathname = "/", search = "", hash = "") {
  const replaced = [];
  return {
    hostname,
    pathname,
    search,
    hash,
    replace(url) {
      replaced.push(url);
    },
    replaced
  };
}

test("apex / redirige a www /", () => {
  const loc = fakeLocation("control.logitec.com.mx", "/");
  assert.equal(api.canonicalizeCloudHost(loc), true);
  assert.deepEqual(loc.replaced, ["https://www.control.logitec.com.mx/"]);
});

test("apex /login.html redirige a www /login.html", () => {
  const loc = fakeLocation("control.logitec.com.mx", "/login.html");
  assert.equal(api.buildCanonicalUrl(loc), "https://www.control.logitec.com.mx/login.html");
  assert.equal(api.canonicalizeCloudHost(loc), true);
  assert.deepEqual(loc.replaced, ["https://www.control.logitec.com.mx/login.html"]);
});

test("apex conserva pathname, query y hash", () => {
  const loc = fakeLocation(
    "control.logitec.com.mx",
    "/dashboard.html",
    "?section=inventory",
    "#import"
  );
  assert.equal(
    api.buildCanonicalUrl(loc),
    "https://www.control.logitec.com.mx/dashboard.html?section=inventory#import"
  );
});

test("www no redirige", () => {
  const loc = fakeLocation("www.control.logitec.com.mx", "/login.html", "?x=1", "#y");
  assert.equal(api.shouldCanonicalizeHost(loc.hostname), false);
  assert.equal(api.buildCanonicalUrl(loc), null);
  assert.equal(api.canonicalizeCloudHost(loc), false);
  assert.deepEqual(loc.replaced, []);
});

test("localhost no redirige", () => {
  const loc = fakeLocation("localhost", "/login.html");
  assert.equal(api.canonicalizeCloudHost(loc), false);
  assert.deepEqual(loc.replaced, []);
});

test("otro dominio no redirige", () => {
  const loc = fakeLocation("example.com", "/");
  assert.equal(api.canonicalizeCloudHost(loc), false);
  const loopback = fakeLocation("127.0.0.1", "/");
  assert.equal(api.canonicalizeCloudHost(loopback), false);
  assert.deepEqual(loc.replaced, []);
  assert.deepEqual(loopback.replaced, []);
});

test("no existe ciclo de redirección", () => {
  const apex = fakeLocation("control.logitec.com.mx", "/dashboard.html", "?qa=canonical", "#inventory");
  api.canonicalizeCloudHost(apex);
  assert.equal(apex.replaced.length, 1);
  const www = new URL(apex.replaced[0]);
  const after = fakeLocation(www.hostname, www.pathname, www.search, www.hash);
  assert.equal(api.canonicalizeCloudHost(after), false);
  assert.deepEqual(after.replaced, []);
  assert.equal(www.hostname, "www.control.logitec.com.mx");
});

test("index.html carga canonical-host.js antes de boot.js", () => {
  assert.match(indexHtml, /data-canonical-host-version="www-v1"/);
  const canonical = indexHtml.indexOf("canonical-host.js?v=1");
  const boot = indexHtml.indexOf("boot.js");
  assert.ok(canonical >= 0 && boot > canonical);
});

test("login.html carga canonical-host.js antes de login.js", () => {
  assert.match(loginHtml, /data-canonical-host-version="www-v1"/);
  const canonical = loginHtml.indexOf("canonical-host.js?v=1");
  const login = loginHtml.indexOf("login.js");
  assert.ok(canonical >= 0 && login > canonical);
});

test("dashboard.html carga canonical-host.js antes de dashboard.js", () => {
  assert.match(dashboardHtml, /data-canonical-host-version="www-v1"/);
  const canonical = dashboardHtml.indexOf("canonical-host.js?v=1");
  const dash = dashboardHtml.indexOf("dashboard.js?v=76");
  assert.ok(canonical >= 0 && dash > canonical);
});

test("login.js impide enviar el formulario si todavía está en el apex", () => {
  assert.match(loginJs, /hostname !== "control\.logitec\.com\.mx"/);
  const submitIdx = loginJs.indexOf('addEventListener("submit"');
  const guardIdx = loginJs.indexOf("redirectApexLoginToWww");
  const fetchIdx = loginJs.indexOf('fetch("/api/auth/login"');
  const innerGuard = loginJs.indexOf("if (redirectApexLoginToWww()) return;");
  assert.ok(guardIdx >= 0 && submitIdx > guardIdx);
  assert.ok(innerGuard > submitIdx && fetchIdx > innerGuard);
  assert.match(loginJs, /location\.replace\(\s*"https:\/\/www\.control\.logitec\.com\.mx"/);
});

test("se conservan compact-workspace-v1, server-cancel-v1 y dashboard.js?v=76", () => {
  assert.match(dashboardHtml, /data-ui-version="compact-workspace-v1"/);
  assert.match(dashboardHtml, /data-import-cancel-version="server-cancel-v1"/);
  assert.match(dashboardHtml, /dashboard\.js\?v=76/);
  assert.doesNotMatch(dashboardHtml, /dashboard\.js\?v=64/);
  assert.doesNotMatch(dashboardHtml, /qa-admin-bridge/);
  assert.match(bootJs, /redirectedToCanonicalWww/);
});

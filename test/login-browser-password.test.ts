import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../public/login.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/login.js", import.meta.url), "utf8");

function sliceFunction(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `missing function ${name}`);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

test("el formulario de login es compatible con el gestor nativo de contraseñas", () => {
  assert.match(html, /id="loginForm"/);
  assert.match(html, /method="post"/);
  assert.match(html, /action="\/api\/auth\/login"/);
  assert.match(html, /id="email"[^>]*autocomplete="username"/);
  assert.match(html, /id="password"[^>]*type="password"/);
  assert.match(html, /id="password"[^>]*autocomplete="current-password"/);
  assert.match(html, /id="submitBtn"[^>]*type="submit"/);
  assert.match(html, /login\.js\?v=4/);
});

test("Recordar correo permanece independiente de Recordar contraseña", () => {
  assert.match(html, /id="rememberEmail"/);
  assert.match(html, /id="rememberPassword"/);
  assert.match(html, /Recordar correo/);
  assert.match(html, /Recordar contraseña en este navegador/);
  assert.match(html, /id="clearRememberedEmailBtn"/);
  assert.match(js, /logitec_remembered_email/);
  const persist = sliceFunction(js, "persistRememberedEmail");
  assert.match(persist, /localStorage\.setItem\(REMEMBERED_EMAIL_KEY, value\)/);
  assert.doesNotMatch(persist, /password/i);
});

test("LOGITEC no persiste la contraseña; solo ofrece el store nativo del navegador", () => {
  assert.doesNotMatch(js, /localStorage\.setItem\([^)]*password/i);
  assert.doesNotMatch(js, /sessionStorage\.setItem\([^)]*password/i);
  assert.doesNotMatch(js, /document\.cookie/);
  assert.doesNotMatch(js, /indexedDB/i);
  assert.doesNotMatch(js, /openDatabase\(/);
  const offer = sliceFunction(js, "offerBrowserPasswordSave");
  assert.match(offer, /PasswordCredential/);
  assert.match(offer, /navigator\.credentials\.store/);
  assert.match(offer, /rememberPassword\?\.checked/);
  assert.match(sliceFunction(js, "canOfferBrowserPasswordSave"), /PasswordCredential/);
  assert.match(sliceFunction(js, "revealRememberPasswordControl"), /rememberPasswordRow\.hidden/);
});

test("el checkbox de contraseña no se muestra si el navegador no tiene API nativa", () => {
  const reveal = sliceFunction(js, "revealRememberPasswordControl");
  assert.match(reveal, /canOfferBrowserPasswordSave\(\)/);
  assert.match(html, /id="rememberPasswordRow" hidden/);
});

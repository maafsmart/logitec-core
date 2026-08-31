import { expect, test, type Page } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  QA_E2E_USERS,
  assertRequiredE2eSecrets,
  formatE2eNetworkRow,
  sanitizeE2eEvidence
} from "../../src/scripts/e2e-safety.js";

const EVIDENCE_DIR = path.resolve("test/e2e/evidence");
mkdirSync(EVIDENCE_DIR, { recursive: true });

const secrets = assertRequiredE2eSecrets(process.env);
const users = {
  ADMIN: { email: QA_E2E_USERS.ADMIN.email, password: secrets.adminPassword },
  SUPERVISOR: { email: QA_E2E_USERS.SUPERVISOR.email, password: secrets.qaPassword },
  OPERATOR: { email: QA_E2E_USERS.OPERATOR.email, password: secrets.qaPassword },
  CLIENT: { email: QA_E2E_USERS.CLIENT.email, password: secrets.qaPassword }
} as const;

type Probe = {
  consoleErrors: string[];
  pageErrors: string[];
  network: string[];
  failedRequests: string[];
};

function attachProbes(page: Page): Probe {
  const probe: Probe = { consoleErrors: [], pageErrors: [], network: [], failedRequests: [] };
  page.on("console", (msg) => {
    const line = String(sanitizeE2eEvidence(`[${msg.type()}] ${msg.text()}`));
    appendFileSync(path.join(EVIDENCE_DIR, "console.log"), `${line}\n`);
    if (msg.type() === "error") probe.consoleErrors.push(line);
  });
  page.on("pageerror", (err) => {
    const line = String(sanitizeE2eEvidence(String(err)));
    appendFileSync(path.join(EVIDENCE_DIR, "console.log"), `[pageerror] ${line}\n`);
    probe.pageErrors.push(line);
  });
  page.on("response", (response) => {
    const method = response.request().method();
    const status = response.status();
    const row = formatE2eNetworkRow(method, response.url(), status);
    if (response.url().includes("/api/") || response.url().includes(".html") || status >= 400) {
      probe.network.push(row);
      appendFileSync(path.join(EVIDENCE_DIR, "network.log"), `${row}\n`);
    }
    if (status >= 400) probe.failedRequests.push(row);
  });
  return probe;
}

async function saveEvidence(page: Page, name: string, probe: Probe, extra: Record<string, unknown> = {}) {
  const shot = path.join(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path: shot, fullPage: true });
  writeFileSync(
    path.join(EVIDENCE_DIR, `${name}.json`),
    JSON.stringify(
      sanitizeE2eEvidence({
        name,
        url: page.url(),
        title: await page.title(),
        consoleErrors: probe.consoleErrors,
        pageErrors: probe.pageErrors,
        failedRequests: probe.failedRequests,
        network: probe.network.slice(-80),
        extra
      }),
      null,
      2
    )
  );
}

function unexpected5xx(probe: Probe) {
  return probe.failedRequests.filter((row) => /\s5\d\d$/.test(row));
}

async function login(page: Page, role: keyof typeof users) {
  const probe = attachProbes(page);
  await page.goto("/login.html");
  await page.locator("#email").fill(users[role].email);
  await page.locator("#password").fill(users[role].password);
  await page.locator("#submitBtn").click();
  await page.waitForURL(/dashboard\.html/, { timeout: 20_000 });
  await expect(page.locator(".app-shell")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#sessionDisplayName")).not.toHaveText(/Cargando sesión/i, { timeout: 20_000 });
  return probe;
}

async function enterAdminClientIfNeeded(page: Page, probe: Probe) {
  const gate = page.locator("#clientContextGate");
  const gateVisible = await gate.isVisible().catch(() => false);
  if (!gateVisible) {
    try {
      await gate.waitFor({ state: "visible", timeout: 4_000 });
    } catch {
      return;
    }
  }
  await page.waitForSelector("#clientContextCards article, #clientContextCards .client-master-card", { timeout: 20_000 });
  const addProjectInSelector = page.locator("#clientContextCards").getByRole("button", { name: "Agregar proyecto" });
  await expect(addProjectInSelector).toHaveCount(0);
  await saveEvidence(page, "admin-client-selector", probe, { selectorAddProjectCount: 0 });
  const enter = page.locator("#clientContextCards [data-enter-client]").first();
  await expect(enter).toBeVisible({ timeout: 15_000 });
  await enter.click();
  await expect(gate).toBeHidden({ timeout: 15_000 });
}

function sectionTab(page: Page, section: string) {
  return page.locator(`.nav-section-tab[data-nav-section="${section}"]`);
}

async function expectAccountReadOnlyExceptPassword(page: Page) {
  await sectionTab(page, "sistema").click();
  await expect(page.locator("#moduleAccount")).toBeVisible();
  await expect(page.locator(".official-profile-banner")).toContainText(/Solo lectura/i);
  await expect(page.locator("#accountFullName")).toHaveAttribute("readonly", "");
  await expect(page.locator("#accountJobTitle")).toHaveAttribute("readonly", "");
  await expect(page.locator("#accountPhone")).toHaveAttribute("readonly", "");
  await expect(page.locator("#accountAddress")).toHaveAttribute("readonly", "");
  await expect(page.locator("#accountProfileBtn")).toHaveCount(0);
  await expect(page.locator("#changePasswordForm")).toBeVisible();
}

async function expectUsersAndConfigAbsent(page: Page) {
  await expect(page.locator('[data-module="users"]')).toBeHidden();
  await expect(page.locator('[data-module="config"]')).toBeHidden();
  await expect(page.locator("#moduleUsers")).toBeHidden();
  await expect(page.locator("#moduleConfig")).toBeHidden();
}

async function expectHeaderAndClientClusterComplete(page: Page) {
  const clip = await page.evaluate(() => {
    const bar = document.querySelector(".app-topbar") as HTMLElement | null;
    const cluster = document.querySelector(".client-active-cluster") as HTMLElement | null;
    const btn = document.getElementById("changeClientBtn");
    if (!bar) return { headerOverflow: true, clusterClip: true, btnClip: false };
    const headerOverflow = bar.scrollWidth > bar.clientWidth + 2 || bar.getBoundingClientRect().width > window.innerWidth + 2;
    const cr = cluster?.getBoundingClientRect();
    const clusterClip = Boolean(cr && (cr.right > window.innerWidth + 2 || cr.left < -2 || (cluster && cluster.scrollWidth > cluster.clientWidth + 2)));
    let btnClip = false;
    if (btn && !btn.classList.contains("hidden") && btn.offsetParent) {
      const rr = btn.getBoundingClientRect();
      btnClip = rr.width < 24 || rr.right > window.innerWidth + 2 || rr.left < -2 || btn.scrollWidth > btn.clientWidth + 2;
    }
    return { headerOverflow, clusterClip, btnClip, btnText: btn?.textContent || "" };
  });
  expect(clip.headerOverflow, "header horizontal overflow").toBe(false);
  expect(clip.clusterClip, "cliente activo clipped").toBe(false);
  expect(clip.btnClip, "Cambiar cliente clipped").toBe(false);
}

async function expectOfficialProfileApiBlocked(page: Page) {
  const result = await page.evaluate(async () => {
    const token = localStorage.getItem("token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const attempts = [
      { fullName: "Nombre Hack" },
      { avatarUrl: "https://example.com/hack.png" },
      { jobTitle: "Cargo Hack" },
      { phone: "5550001111" },
      { address: "Calle Hack" }
    ];
    const mePatches = [];
    for (const body of attempts) {
      const res = await fetch("/api/auth/me", { method: "PATCH", headers, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      mePatches.push({ status: res.status, code: json.code || null, field: Object.keys(body)[0] });
    }
    const me = await fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } });
    const meJson = (await me.json().catch(() => ({}))) as { id?: string; fullName?: string };
    const own = await fetch(`/api/users/${meJson.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ fullName: "Nombre Hack" })
    });
    return {
      mePatches,
      usersStatus: own.status,
      fullName: meJson.fullName || ""
    };
  });
  for (const row of result.mePatches) {
    expect(row.status, `PATCH /me ${row.field}`).toBe(403);
    expect(row.code).toBe("SELF_PROFILE_READONLY");
  }
  expect(result.usersStatus).toBe(403);
  expect(result.fullName).not.toMatch(/Nombre Hack/i);
}

function focusSubnavBtn(page: Page, moduleName: string) {
  return page.locator(`#focusSubnavSlot .nav-section-panel.active .module-btn[data-module="${moduleName}"]`);
}

const INVENTORY_FOCUS_MODULES = [
  ["inventory", /Existencias/i],
  ["clients", /Clientes/i],
  ["catalog", /Catálogo/i],
  ["projects", /Proyectos/i],
  ["warehouses", /Almacenes/i],
  ["locations", /Ubicaciones/i]
] as const;

async function expectValuationVisible(page: Page, canEdit: boolean) {
  await sectionTab(page, "inventario").click();
  await page.locator('[data-module="inventory"]').click();
  await expect(page.locator("#moduleInventory .js-economic-card").first()).toBeVisible();
  if (canEdit) {
    await expect(page.locator("#openInventoryImportBtn")).toBeVisible();
  } else {
    await expect(page.locator(".js-economic-edit:visible")).toHaveCount(0);
    await expect(page.locator("#openInventoryImportBtn")).toBeHidden();
  }
}

test.describe("regresión UI por roles", () => {
  test("login recuerda correo y no guarda contraseña", async ({ page }) => {
    const probe = attachProbes(page);
    await page.goto("/login.html");
    await expect(page.locator("#rememberEmail")).toBeVisible();
    await expect(page.locator("#email")).toHaveAttribute("autocomplete", "username");
    await expect(page.locator("#password")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.locator("#clearRememberedEmailBtn")).toBeVisible();
    const nativePasswordApi = await page.evaluate(
      () =>
        Boolean(
          window.isSecureContext &&
            typeof window.PasswordCredential === "function" &&
            navigator.credentials &&
            typeof navigator.credentials.store === "function"
        )
    );
    if (nativePasswordApi) {
      await expect(page.locator("#rememberPasswordRow")).toBeVisible();
      await expect(page.locator("#rememberPassword")).toBeVisible();
    } else {
      await expect(page.locator("#rememberPasswordRow")).toBeHidden();
    }
    await saveEvidence(page, "login-remember-controls", probe, { nativeStoreAvailable: nativePasswordApi });
    await page.locator("#email").fill(users.ADMIN.email);
    await page.locator("#clearRememberedEmailBtn").click();
    await expect(page.locator("#email")).toHaveValue("");
    await expect(page.locator("#password")).toHaveValue("");
    await page.locator("#email").fill(users.ADMIN.email);
    await page.locator("#rememberEmail").check();
    await page.locator("#password").fill(users.ADMIN.password);
    await page.locator("#submitBtn").click();
    await page.waitForURL(/dashboard\.html/);
    const remembered = await page.evaluate(() => localStorage.getItem("logitec_remembered_email"));
    const storedKeys = await page.evaluate(() => Object.keys(localStorage));
    const passwordLeaked = await page.evaluate((secret) => {
      const inspect = (store: Storage) => {
        for (let i = 0; i < store.length; i += 1) {
          const key = store.key(i) || "";
          const value = store.getItem(key) || "";
          if (/password/i.test(key) || value === secret) return true;
        }
        return false;
      };
      return inspect(localStorage) || inspect(sessionStorage) || document.cookie.includes(secret);
    }, users.ADMIN.password);
    expect(remembered).toBe(users.ADMIN.email.toLowerCase());
    expect(storedKeys.some((key) => /password/i.test(key))).toBe(false);
    expect(passwordLeaked).toBe(false);
    expect(unexpected5xx(probe)).toEqual([]);
    await saveEvidence(page, "login-remember-email", probe, {
      remembered,
      storedKeys,
      nativePasswordApi,
      passwordLeaked
    });

    await page.goto("/login.html");
    await expect(page.locator("#email")).toHaveValue(users.ADMIN.email.toLowerCase());
    await page.locator("#rememberEmail").uncheck();
    await page.locator("#password").fill(users.ADMIN.password);
    await page.locator("#submitBtn").click();
    await page.waitForURL(/dashboard\.html/);
    const rememberedOff = await page.evaluate(() => localStorage.getItem("logitec_remembered_email"));
    expect(rememberedOff).toBeFalsy();
  });

  test("ADMIN: sin Entrada masiva, sin Agregar proyecto en selector, catálogo distinto de inventario", async ({ page }) => {
    const probe = attachProbes(page);
    await page.goto("/login.html");
    await page.locator("#email").fill(users.ADMIN.email);
    await page.locator("#password").fill(users.ADMIN.password);
    await page.locator("#submitBtn").click();
    await page.waitForURL(/dashboard\.html/, { timeout: 20_000 });
    await enterAdminClientIfNeeded(page, probe);
    await sectionTab(page, "operacion").click();
    await expect(page.getByRole("button", { name: "Entrada masiva" })).toHaveCount(0);
    await saveEvidence(page, "admin-operacion-no-bulk", probe);
    await expectValuationVisible(page, true);
    await page.locator('[data-module="catalog"]').click();
    await expect(page.locator("#openCatalogImportBtn")).toBeVisible();
    await saveEvidence(page, "admin-catalog-import", probe, { catalogImportVisible: true });
    await sectionTab(page, "inicio").click();
    await expect(page.locator("#ccAddProjectBtn")).toBeVisible();
    await page.locator("#ccAddProjectBtn").click();
    await expect(page.locator("#masterDataModal")).toBeVisible();
    await expect(page.locator("#masterDataTitle")).toContainText(/proyecto/i);
    await saveEvidence(page, "admin-cc-add-project-modal", probe);
    await page.locator('#masterDataModal [data-close-modal="masterDataModal"]').first().click();
    await expect(page.locator("#masterDataModal")).toBeHidden({ timeout: 10_000 });
    expect(unexpected5xx(probe)).toEqual([]);
  });

  test("ADMIN Sistema: cuenta solo lectura, POST /api/users 400 USER_CLIENT_REQUIRED, preview CLEAN_START", async ({
    page
  }) => {
    test.setTimeout(240_000);
    const probe = attachProbes(page);
    await page.goto("/login.html");
    await page.locator("#email").fill(users.ADMIN.email);
    await page.locator("#password").fill(users.ADMIN.password);
    await page.locator("#submitBtn").click();
    await page.waitForURL(/dashboard\.html/, { timeout: 20_000 });
    await enterAdminClientIfNeeded(page, probe);
    await expectAccountReadOnlyExceptPassword(page);
    await page.locator('[data-module="users"]').click();
    await expect(page.locator("#moduleUsers")).toBeVisible();
    await expect(page.locator("#createUserForm")).toBeVisible();
    const order = await page.evaluate(() => {
      const ids = ["moduleAccount", "moduleUsers", "moduleConfig"];
      return ids
        .map((id) => {
          const el = document.getElementById(id);
          if (!el) return { id, order: 99, top: 9_999 };
          return { id, order: Number(window.getComputedStyle(el).order || 0), top: el.getBoundingClientRect().top };
        })
        .sort((a, b) => a.top - b.top)
        .map((row) => row.id);
    });
    expect(order[0]).toBe("moduleAccount");
    await saveEvidence(page, "admin-sistema-order", probe, { order });

    const throwawayPassword = `Qa${randomBytes(8).toString("hex")}`;
    await expect(page.locator("#createUserForm")).toBeVisible();
    await page.locator("#newFullName").fill("QA Operator Sin Cliente");
    await page.locator("#newEmail").fill("qa.operator.noclient@logitec.local");
    await page.locator("#newPassword").fill(throwawayPassword);
    await page.locator("#newRole").selectOption("OPERATOR");
    await page.locator("#newClientId").selectOption("");
    await page.locator("#createUserBtn").click();
    await expect(page.locator("#createUserError")).toContainText(/cliente asignado/i);
    await saveEvidence(page, "admin-users-client-required-ui", probe);

    const api400 = await page.evaluate(async (password) => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "qa.operator.http400@logitec.local",
          password,
          fullName: "QA Operator HTTP 400",
          role: "OPERATOR",
          clientId: ""
        })
      });
      const body = (await res.json().catch(() => null)) as { code?: string } | null;
      return { status: res.status, code: body?.code || null };
    }, throwawayPassword);
    expect(api400.status).toBe(400);
    expect(api400.code).toBe("USER_CLIENT_REQUIRED");
    await saveEvidence(page, "admin-users-post-400", probe, { api400 });

    for (const size of [
      { width: 1366, height: 768 },
      { width: 1600, height: 900 },
      { width: 1920, height: 1080 }
    ]) {
      await page.setViewportSize(size);
      await sectionTab(page, "inventario").click();
      await page.locator('[data-module="inventory"]').click();
      await expect(page.locator("#moduleInventory")).toBeVisible();
      await page.locator("#focusModeBtn").click();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);
      await expect(page.locator("#focusModeBtn")).toHaveText(/Salir de concentración/);
      await expect(page.locator(".sidebar")).toBeHidden();
      await expect(page.locator("#focusNavSlot")).toBeVisible();
      await expect(page.locator("#focusSubnavSlot")).toBeVisible();
      await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']")).toHaveClass(/active/);
      for (const section of ["inicio", "operacion", "inventario", "control", "sistema"]) {
        await expect(page.locator(`#focusNavSlot .nav-section-tab[data-nav-section="${section}"]`)).toBeVisible();
      }
      for (const [mod, label] of INVENTORY_FOCUS_MODULES) {
        const btn = focusSubnavBtn(page, mod);
        await expect(btn, `Inventario → ${mod} @ ${size.width}`).toBeVisible();
        await expect(btn).toContainText(label);
      }
      await expect(focusSubnavBtn(page, "inventory")).toHaveClass(/active/);
      await expectHeaderAndClientClusterComplete(page);
      await expect(page.locator("#focusNavSlot .nav-section-tab.active")).toHaveText(/Inventario/i);
      await saveEvidence(page, `admin-focus-mode-${size.width}x${size.height}`, probe, { viewport: size });

      await focusSubnavBtn(page, "warehouses").click();
      await expect(page.locator("#moduleWarehouses")).toBeVisible();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);
      await expect(focusSubnavBtn(page, "warehouses")).toHaveClass(/active/);

      await page.locator("#focusNavSlot .nav-section-tab[data-nav-section='operacion']").click();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);
      await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='operacion']")).toHaveClass(/active/);
      await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']")).not.toHaveClass(/active/);
      await expect(page.locator("#focusNavSlot .nav-section-tab.active")).toHaveText(/Operación/i);
      await expect(focusSubnavBtn(page, "inbound")).toBeVisible();
      await expect(focusSubnavBtn(page, "requisitions")).toBeVisible();
      await expect(focusSubnavBtn(page, "picking")).toBeVisible();
      await expect(focusSubnavBtn(page, "relocate")).toBeVisible();
      await expect(focusSubnavBtn(page, "outbound")).toBeVisible();
      await focusSubnavBtn(page, "inbound").click();
      await expect(page.locator("#moduleInbound")).toBeVisible();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);

      await page.locator("#focusNavSlot .nav-section-tab[data-nav-section='control']").click();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);
      await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='control']")).toHaveClass(/active/);
      await expect(page.locator("#focusNavSlot .nav-section-tab.active")).toHaveText(/Control/i);
      await expect(focusSubnavBtn(page, "incidents")).toBeVisible();
      await expect(focusSubnavBtn(page, "traceability")).toBeVisible();
      await expect(focusSubnavBtn(page, "reports")).toBeVisible();

      await page.locator("#focusNavSlot .nav-section-tab[data-nav-section='sistema']").click();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);
      await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='sistema']")).toHaveClass(/active/);
      await expect(page.locator("#focusNavSlot .nav-section-tab.active")).toHaveText(/Sistema/i);
      await expect(focusSubnavBtn(page, "account")).toBeVisible();
      await expect(focusSubnavBtn(page, "users")).toBeVisible();
      await expect(focusSubnavBtn(page, "config")).toBeVisible();
      await focusSubnavBtn(page, "account").click();
      await expect(page.locator("#moduleAccount")).toBeVisible();
      await expect(page.locator("#moduleUsers")).toBeHidden();
      await focusSubnavBtn(page, "users").click();
      await expect(page.locator("#moduleUsers")).toBeVisible();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);
      await focusSubnavBtn(page, "config").click();
      await expect(page.locator("#moduleConfig")).toBeVisible();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);

      await page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inicio']").click();
      await expect(page.locator("body")).toHaveClass(/focus-mode/);
      await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inicio']")).toHaveClass(/active/);
      await expect(page.locator("#focusNavSlot .nav-section-tab.active")).toHaveText(/Inicio/i);
      await expect(focusSubnavBtn(page, "control")).toBeVisible();
      await expect(focusSubnavBtn(page, "tasks").first()).toBeVisible();
      await page.locator("#focusModeBtn").click();
      await expect(page.locator("body")).not.toHaveClass(/focus-mode/);
      await expect(page.locator("#focusNavHome .nav-section-tabs")).toBeVisible();
      await expect(page.locator("#focusNavSlot .nav-section-tabs")).toHaveCount(0);
      await expect(page.locator("#focusSubnavHome .nav-section-body")).toBeVisible();
      await expect(page.locator("#focusSubnavSlot .nav-section-body")).toHaveCount(0);
    }

    await sectionTab(page, "sistema").click();
    await page.locator('[data-module="config"]').click();
    await expect(page.locator("#moduleConfig")).toBeVisible();
    const preview = page.locator("#operationalHistoryPreviewBtn");
    await preview.scrollIntoViewIfNeeded();
    await expect(preview).toBeVisible();
    const previewResponse = page.waitForResponse((res) => res.url().includes("/api/admin/operational-history/preview"));
    await preview.click();
    const res = await previewResponse;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("counts");
    expect(res.request().method()).toBe("GET");
    await expect(page.locator("#operationalHistoryScopeHint")).toContainText(/AVIAT|cifras/i);
    await expect(page.locator("#operationalHistoryCounts")).toContainText(/Movs/i);
    await saveEvidence(page, "admin-clean-start-preview", probe, {
      previewStatus: res.status(),
      previewMethod: res.request().method(),
      isAviat: body?.isAviat,
      counts: body?.counts
    });
    expect(unexpected5xx(probe)).toEqual([]);
  });

  test("SUPERVISOR no ve importación, usuarios ni Entrada masiva", async ({ page }) => {
    const probe = await login(page, "SUPERVISOR");
    await expect(page.locator("#clientContextGate")).toBeHidden();
    await expect(page.getByRole("button", { name: "Entrada masiva" })).toHaveCount(0);
    await expectValuationVisible(page, false);
    await expect(page.locator("#openInventoryImportBtn")).toBeHidden();
    await page.locator('[data-module="catalog"]').click();
    await expect(page.locator("#openCatalogImportBtn")).toBeHidden();
    await expectAccountReadOnlyExceptPassword(page);
    await expectUsersAndConfigAbsent(page);
    await expectOfficialProfileApiBlocked(page);
    await expect(page.locator("#createUserForm")).toBeHidden();
    await expect(page.locator("#moduleUsers")).toBeHidden();
    await page.locator("#focusModeBtn").click();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']")).toBeVisible();
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='sistema']")).toBeVisible();
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="account"]')).toBeVisible();
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="users"]')).toBeHidden();
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="config"]')).toBeHidden();
    await page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']").click();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']")).toHaveClass(/active/);
    for (const [mod] of INVENTORY_FOCUS_MODULES) {
      if (mod === "clients") continue;
      await expect(focusSubnavBtn(page, mod)).toBeVisible();
    }
    await focusSubnavBtn(page, "inventory").click();
    await expect(page.locator("#moduleInventory")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await page.locator("#focusModeBtn").click();
    expect(unexpected5xx(probe)).toEqual([]);
    await saveEvidence(page, "supervisor-sistema", probe);
  });

  test("OPERATOR ve valuación no editable y no importa ni administra usuarios", async ({ page }) => {
    const probe = await login(page, "OPERATOR");
    await expect(page.getByRole("button", { name: "Entrada masiva" })).toHaveCount(0);
    await expectValuationVisible(page, false);
    await expect(page.locator("#openInventoryImportBtn")).toBeHidden();
    await expectAccountReadOnlyExceptPassword(page);
    await expectUsersAndConfigAbsent(page);
    await expectOfficialProfileApiBlocked(page);
    await expect(page.locator("#moduleUsers")).toBeHidden();
    await expect(page.locator("#moduleConfig")).toBeHidden();
    await page.locator("#focusModeBtn").click();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']")).toBeVisible();
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='operacion']")).toBeVisible();
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="users"]')).toBeHidden();
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="config"]')).toBeHidden();
    await page.locator("#focusNavSlot .nav-section-tab[data-nav-section='operacion']").click();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="inbound"]')).toBeVisible();
    await page.locator('#focusSubnavSlot .module-btn[data-module="inbound"]').click();
    await expect(page.locator("#moduleInbound")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await page.locator("#focusModeBtn").click();
    expect(unexpected5xx(probe)).toEqual([]);
    await saveEvidence(page, "operator-inventory", probe);
  });

  test("CLIENT entra con cuenta QA y no ve administración global", async ({ page }) => {
    const probe = await login(page, "CLIENT");
    await expect(page.locator("#sessionRoleInline")).toHaveText(/CLIENT/);
    await expect(page.getByRole("button", { name: "Entrada masiva" })).toHaveCount(0);
    await expectValuationVisible(page, false);
    await expect(page.locator("#openInventoryImportBtn")).toBeHidden();
    await expectAccountReadOnlyExceptPassword(page);
    await expectUsersAndConfigAbsent(page);
    await expectOfficialProfileApiBlocked(page);
    await expect(page.locator("#moduleUsers")).toBeHidden();
    await expect(page.locator("#moduleConfig")).toBeHidden();
    await page.locator("#focusModeBtn").click();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']")).toBeVisible();
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inicio']")).toBeHidden();
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="users"]')).toBeHidden();
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="config"]')).toBeHidden();
    await page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']").click();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await expect(page.locator("#focusNavSlot .nav-section-tab[data-nav-section='inventario']")).toHaveClass(/active/);
    await expect(page.locator('#focusSubnavSlot .module-btn[data-module="inventory"]')).toBeVisible();
    await page.locator('#focusSubnavSlot .module-btn[data-module="inventory"]').click();
    await expect(page.locator("#moduleInventory")).toBeVisible();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await page.locator("#focusModeBtn").click();
    expect(unexpected5xx(probe)).toEqual([]);
    await saveEvidence(page, "client-sistema", probe);
  });

  test("Avisos: Recibidos filtra asignados a mí; Crear usuario es atajo ADMIN a Usuarios", async ({ page }) => {
    const probe = attachProbes(page);
    await page.goto("/login.html");
    await page.locator("#email").fill(users.ADMIN.email);
    await page.locator("#password").fill(users.ADMIN.password);
    await page.locator("#submitBtn").click();
    await page.waitForURL(/dashboard\.html/, { timeout: 20_000 });
    await enterAdminClientIfNeeded(page, probe);
    await sectionTab(page, "inicio").click();
    await page.locator("#btnInternalNotices").click();
    await expect(page.locator("#taskTabNotices")).toBeVisible();
    await expect(page.locator("#taskNoticesHint")).toBeVisible();
    await expect(page.locator("#taskNoticesHint")).toContainText(/asignados a ti/i);
    const createUser = page.locator("#taskCreateUserBtn");
    await expect(createUser).toBeVisible();
    await createUser.click();
    await expect(page.locator("#createUserForm")).toBeVisible();
    expect(unexpected5xx(probe)).toEqual([]);
    await saveEvidence(page, "admin-avisos", probe);
  });
});

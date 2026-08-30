import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const EVIDENCE_DIR = path.resolve("test/e2e/evidence");
mkdirSync(EVIDENCE_DIR, { recursive: true });

const users = {
  ADMIN: { email: process.env.E2E_ADMIN_EMAIL || "admin@logitec.local", password: process.env.E2E_ADMIN_PASSWORD || "Admin1234" },
  SUPERVISOR: { email: "qa.supervisor@logitec.local", password: process.env.QA_E2E_PASSWORD || "QaUser1234" },
  OPERATOR: { email: "qa.operator@logitec.local", password: process.env.QA_E2E_PASSWORD || "QaUser1234" },
  CLIENT: { email: "qa.client@logitec.local", password: process.env.QA_E2E_PASSWORD || "QaUser1234" }
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
    const line = `[${msg.type()}] ${msg.text()}`;
    if (msg.type() === "error") probe.consoleErrors.push(line);
  });
  page.on("pageerror", (err) => {
    probe.pageErrors.push(String(err));
  });
  page.on("response", (response) => {
    const method = response.request().method();
    const url = response.url();
    const status = response.status();
    const row = `${method} ${url} ${status}`;
    if (url.includes("/api/") || url.includes(".html") || status >= 400) {
      probe.network.push(row);
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
      {
        name,
        url: page.url(),
        title: await page.title(),
        consoleErrors: probe.consoleErrors,
        pageErrors: probe.pageErrors,
        failedRequests: probe.failedRequests,
        network: probe.network.slice(-80),
        extra
      },
      null,
      2
    )
  );
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

test.describe("regresión UI por roles", () => {
  test("login recuerda correo y no guarda contraseña", async ({ page }) => {
    const probe = attachProbes(page);
    await page.goto("/login.html");
    await expect(page.locator("#rememberEmail")).toBeVisible();
    await page.locator("#email").fill(users.ADMIN.email);
    await page.locator("#rememberEmail").check();
    await page.locator("#password").fill(users.ADMIN.password);
    await page.locator("#submitBtn").click();
    await page.waitForURL(/dashboard\.html/);
    const remembered = await page.evaluate(() => localStorage.getItem("logitec_remembered_email"));
    const storedKeys = await page.evaluate(() => Object.keys(localStorage));
    expect(remembered).toBe(users.ADMIN.email.toLowerCase());
    expect(storedKeys.some((key) => /password/i.test(key))).toBe(false);
    await saveEvidence(page, "login-remember-email", probe, { remembered, storedKeys });
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
    await sectionTab(page, "inventario").click();
    await page.locator('[data-module="inventory"]').click();
    await expect(page.locator("#openInventoryImportBtn")).toBeVisible();
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
  });

  test("ADMIN Sistema: cuenta solo lectura, POST /api/users 400 USER_CLIENT_REQUIRED, preview CLEAN_START", async ({
    page
  }) => {
    const probe = attachProbes(page);
    await page.goto("/login.html");
    await page.locator("#email").fill(users.ADMIN.email);
    await page.locator("#password").fill(users.ADMIN.password);
    await page.locator("#submitBtn").click();
    await page.waitForURL(/dashboard\.html/, { timeout: 20_000 });
    await enterAdminClientIfNeeded(page, probe);
    await sectionTab(page, "sistema").click();
    await expect(page.locator("#moduleAccount")).toBeVisible();
    await expect(page.locator("#accountFullName")).toHaveAttribute("readonly", "");
    await expect(page.locator("#accountProfileBtn")).toHaveCount(0);
    await expect(page.locator("#changePasswordForm")).toBeVisible();
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

    await expect(page.locator("#createUserForm")).toBeVisible();
    await page.locator("#newFullName").fill("QA Operator Sin Cliente");
    await page.locator("#newEmail").fill("qa.operator.noclient@logitec.local");
    await page.locator("#newPassword").fill("secret12");
    await page.locator("#newRole").selectOption("OPERATOR");
    await page.locator("#newClientId").selectOption("");
    await page.locator("#createUserBtn").click();
    await expect(page.locator("#createUserError")).toContainText(/cliente asignado/i);
    await saveEvidence(page, "admin-users-client-required-ui", probe);

    const api400 = await page.evaluate(async () => {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "qa.operator.http400@logitec.local",
          password: "secret12",
          fullName: "QA Operator HTTP 400",
          role: "OPERATOR",
          clientId: ""
        })
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    });
    expect(api400.status).toBe(400);
    expect((api400.body as { code?: string }).code).toBe("USER_CLIENT_REQUIRED");
    await saveEvidence(page, "admin-users-post-400", probe, { api400 });

    await page.locator("#focusModeBtn").click();
    await expect(page.locator("body")).toHaveClass(/focus-mode/);
    await expect(page.locator("#focusModeBtn")).toHaveText(/Salir de concentración/);
    await expect(page.locator(".sidebar")).toBeHidden();
    await saveEvidence(page, "admin-focus-mode", probe);
    await page.locator("#focusModeBtn").click();

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
  });

  test("SUPERVISOR no ve importación, usuarios ni alta de proyecto en selector", async ({ page }) => {
    const probe = await login(page, "SUPERVISOR");
    await expect(page.locator("#clientContextGate")).toBeHidden();
    await expect(page.getByRole("button", { name: "Entrada masiva" })).toHaveCount(0);
    await sectionTab(page, "inventario").click();
    await page.locator('[data-module="inventory"]').click();
    await expect(page.locator("#openInventoryImportBtn")).toBeHidden();
    await page.locator('[data-module="catalog"]').click();
    await expect(page.locator("#openCatalogImportBtn")).toBeHidden();
    await sectionTab(page, "sistema").click();
    await expect(page.locator("#moduleAccount")).toBeVisible();
    await expect(page.locator("#createUserForm")).toBeHidden();
    await expect(page.locator("#moduleUsers")).toBeHidden();
    await saveEvidence(page, "supervisor-sistema", probe);
  });

  test("OPERATOR ve valuación no editable y no importa inventario", async ({ page }) => {
    const probe = await login(page, "OPERATOR");
    await sectionTab(page, "inventario").click();
    await page.locator('[data-module="inventory"]').click();
    await expect(page.locator("#openInventoryImportBtn")).toBeHidden();
    await expect(page.locator(".js-economic-edit:visible")).toHaveCount(0);
    await expect(page.locator("#moduleInventory .js-economic-card").first()).toBeVisible();
    await saveEvidence(page, "operator-inventory", probe);
  });

  test("CLIENT no opera Sistema de usuarios ni importadores", async ({ page }) => {
    const probe = await login(page, "CLIENT");
    await expect(page.getByRole("button", { name: "Entrada masiva" })).toHaveCount(0);
    await sectionTab(page, "inventario").click();
    await expect(page.locator("#openInventoryImportBtn")).toBeHidden();
    await sectionTab(page, "sistema").click();
    await expect(page.locator("#moduleAccount")).toBeVisible();
    await expect(page.locator("#moduleUsers")).toBeHidden();
    await expect(page.locator("#moduleConfig")).toBeHidden();
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
    await saveEvidence(page, "admin-avisos", probe);
  });
});

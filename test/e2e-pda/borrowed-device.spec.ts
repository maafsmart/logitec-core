import { expect, test } from "@playwright/test";

test("PDA repite código, bloquea superficie y confirma devolución", async ({ page }) => {
  page.on("pageerror", (error) => console.error("PDA page error:", error.message));
  const attempts: Array<Record<string, unknown>> = [];
  const readings: Array<{ clientSeq: number; attemptId: string; result: string; createdAt: string }> = [];
  let released = false;
  let runCreated = false;
  const qaStepState = new Map<string, string>();
  const run = {
    id: "run-browser-id",
    publicId: "RUN-BROWSER",
    status: "ACTIVE",
    epoch: 1,
    version: 0,
    sealedAtSeq: null as number | null,
    receivedCount: 0
  };

  await page.route("**/api/pda/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() || {};
    if (path === "/api/pda/context") {
      await route.fulfill({
        status: released ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(released
          ? { message: "Grant revocado", code: "PDA_GRANT_REVOKED" }
          : {
              grant: {
                publicId: "GRANT-BROWSER",
                status: "ACTIVE",
                expiresAt: "2026-09-02T18:00:00.000Z"
              },
              session: {
                id: "session-browser",
                testId: "PDA-20260902-BROWSER",
                status: "OPEN",
                captureEpoch: 1
              },
              runs: runCreated ? [run] : []
            })
      });
      return;
    }
    if (path === "/api/pda/runs" && request.method() === "POST") {
      runCreated = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ run, duplicate: false })
      });
      return;
    }
    if (path === `/api/pda/runs/${run.id}` && request.method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...run, readings })
      });
      return;
    }
    if (path === `/api/pda/runs/${run.id}/qa-progress` && request.method() === "GET") {
      const ids = [
        "HARDWARE_IDENTIFIED", "NO_ADMIN_LOGIN", "VALID_READ", "REPEATED_READ",
        "NOT_FOUND_OR_NOT_READ", "IDEMPOTENT_RETRY", "HID_ENTER", "MANUAL_FALLBACK",
        "NETWORK_RECONNECT", "BACKGROUND_LOCK", "RELOAD_CONTINUITY", "SEALED_RECONCILED",
        "ZERO_PENDING_COMPLETE", "SAFE_TO_RETURN", "REVOKED_401"
      ];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          runId: run.id,
          verdict: "PENDING",
          steps: ids.map((id) => ({ id, status: qaStepState.get(id) || "PENDING" }))
        })
      });
      return;
    }
    if (path.includes(`/api/pda/runs/${run.id}/qa-progress/`) && request.method() === "PUT") {
      const step = path.split("/").at(-1) || "";
      qaStepState.set(step, String(body.status));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: body.status })
      });
      return;
    }
    if (path === `/api/pda/runs/${run.id}/readings`) {
      attempts.push(body);
      run.receivedCount += 1;
      readings.push({
        clientSeq: Number(body.clientSeq),
        attemptId: String(body.attemptId),
        result: "OK",
        createdAt: new Date().toISOString()
      });
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          duplicate: false,
          reading: {
            rawCode: body.rawCode,
            normalizedCode: body.rawCode,
            classification: "SKU",
            result: "OK",
            classificationMs: 4
          }
        })
      });
      return;
    }
    if (path.endsWith("/seal")) {
      run.status = "DRAINING";
      run.sealedAtSeq = Number(body.sealedAtSeq);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(run) });
      return;
    }
    if (path.endsWith("/reconcile")) {
      run.status = "RECONCILED";
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run, reconciled: true, missing: [] })
      });
      return;
    }
    if (path === "/api/pda/release/prepare") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          grantPublicId: "GRANT-BROWSER",
          releaseNonce: body.releaseNonce,
          runs: [run.publicId]
        })
      });
      return;
    }
    if (path === "/api/pda/release/confirm") {
      released = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ safeToReturn: true, receiptId: "REL-BROWSER" })
      });
      return;
    }
    if (path === "/api/pda/releases/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ safeToReturn: true, receiptId: "REL-BROWSER" })
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/pda-scanner-lab.html");
  await expect(page.locator("#testId")).toHaveText("PDA-20260902-BROWSER");
  await expect(page.locator("body")).not.toContainText(/inventario global|valuación|usuarios|exportaciones/i);

  await page.locator("#physicalZone").fill("AN20");
  for (let index = 0; index < 2; index += 1) {
    await page.locator("#scanInput").fill("SKU-REPETIDO");
    await page.locator("#scanBtn").click();
    await expect.poll(() => attempts.length).toBe(index + 1);
  }
  expect(attempts.map((item) => item.rawCode)).toEqual(["SKU-REPETIDO", "SKU-REPETIDO"]);
  expect(attempts[0]?.attemptId).not.toBe(attempts[1]?.attemptId);
  expect(attempts.map((item) => item.clientSeq)).toEqual([1, 2]);

  await page.locator("#scanInput").fill("SENSIBLE-123456");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#privacyLock")).toBeVisible();
  await expect(page.locator("#scanInput")).toHaveValue("");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
  await page.locator("#resumeBtn").click();
  await expect(page.locator("#labWorkspace")).toBeVisible();

  await page.locator("#releaseBtn").click();
  await expect(page.locator("#privacyLock h2")).toHaveText("PRUEBA TERMINADA — PUEDES DEVOLVER EL EQUIPO");
  expect(released).toBe(true);
});

test("pairing limpia URL y no persiste secreto ni bearer", async ({ page }) => {
  let exchanged: Record<string, unknown> | null = null;
  await page.route("**/api/pda/pairings/exchange", async (route) => {
    exchanged = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        grant: {
          publicId: "GRANT-PAIR-BROWSER",
          testId: "PDA-20260902-PAIR"
        }
      })
    });
  });
  await page.route("**/pda-scanner-lab.html", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>paired</p>" })
  );
  const invitation = `PAIR-browser-test.${"A".repeat(26)}`;
  await page.goto(`/pda-pair.html?secret=must-disappear#p=${encodeURIComponent(invitation)}`);
  await expect(page).toHaveURL(/\/pda-scanner-lab\.html$/);
  expect(exchanged).toEqual({
    pairingId: "PAIR-browser-test",
    secret: "A".repeat(26),
    mode: "MANUAL"
  });
  const storage = await page.evaluate(() => ({
    local: { ...localStorage },
    session: { ...sessionStorage }
  }));
  expect(storage.local).toEqual({ "logitec:pda:active-grant": "GRANT-PAIR-BROWSER" });
  expect(storage.session).toEqual({});
  expect(JSON.stringify(storage)).not.toContain("A".repeat(26));
});

test("ADMIN evidence abre sesión existente y emite pairing bajo CSP real sin WASM writer", async ({ page }) => {
  const dialogs: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const wasmRequests: string[] = [];
  const qrDataUrl =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=";
  const testId = "PDA-20260902-39399C1048F3873B149E3110";
  const session = {
    id: "session-motorola-existing",
    testId,
    status: "OPEN",
    deviceType: "PDA prestado",
    deviceBrand: null,
    deviceModel: "moto g86 POWER",
    totalReadings: 0,
    okReadings: 0,
    notFoundReadings: 0,
    failedReadings: 0,
    successRate: null,
    detectionMinMs: null,
    detectionMedianMs: null,
    detectionP95Ms: null,
    classificationMinMs: null,
    classificationMedianMs: null,
    classificationP95Ms: null,
    startedAt: new Date().toISOString(),
    finalizedAt: null,
    createdAt: new Date().toISOString(),
    runs: [],
    readings: []
  };

  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const url = request.url();
    if (/\/vendor\/zxing-wasm\/.*writer|zxing_writer\.wasm/.test(url)) {
      wasmRequests.push(url);
    }
  });
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-admin-token");
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "admin",
      role: "ADMIN",
      email: "qa@example.invalid",
      fullName: "QA Admin",
      operationalClient: { id: "client-a", code: "AVIAT", name: "QA AVIAT" }
    })
  }));
  await page.route("**/api/admin/pda-test-sessions**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "GET" && path === "/api/admin/pda-test-sessions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([session])
      });
      return;
    }
    if (request.method() === "GET" && path.endsWith("/remote-qa")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: { id: session.id, testId }, runs: [] })
      });
      return;
    }
    if (request.method() === "POST" && path.endsWith("/pairings")) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          manualCode: `PAIR-MOTO.${"A".repeat(26)}`,
          qrPayload: `LOGITEC-PDA1:PAIR-MOTO.${"B".repeat(43)}`,
          qrImageDataUrl: qrDataUrl
        })
      });
      return;
    }
    if (request.method() === "GET" && path.endsWith(`/${testId}`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session)
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  const response = await page.goto("/pda-test-evidence.html");
  const csp = response?.headers()["content-security-policy"] || "";
  expect(csp).toMatch(/wasm-unsafe-eval/);
  expect(csp).not.toMatch(/'unsafe-eval'/);
  await expect(page.locator(".open-session")).toHaveCount(1);
  await page.locator(".open-session").click();
  await expect(page.locator("#detailTitle")).toHaveText(testId);
  await expect(page.locator("#runsSummary")).toHaveText("Sin runs.");
  await expect(page.locator("#pairBtn")).toBeVisible();
  await page.locator("#pairBtn").click();
  await expect(page.locator("#remoteInviteUrl")).toHaveValue(/\/pda-pair\.html#p=/);
  await expect(page.locator("#pairingQr img")).toHaveAttribute("src", qrDataUrl);
  expect(dialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors.filter((line) => /Content Security Policy|WebAssembly|unsafe-eval/i.test(line))).toEqual([]);
  expect(wasmRequests).toEqual([]);
});

test("ADMIN crea, abre y emite invitación sin alert ni nodo DOM ausente", async ({ page }) => {
  const dialogs: string[] = [];
  const pageErrors: string[] = [];
  const testId = "PDA-20260902-MOTOROLA";
  const session = {
    id: "session-motorola",
    testId,
    status: "OPEN",
    deviceType: "PDA prestado",
    deviceBrand: null,
    deviceModel: "moto g86 POWER",
    totalReadings: 0,
    okReadings: 0,
    notFoundReadings: 0,
    failedReadings: 0,
    successRate: null,
    detectionMinMs: null,
    detectionMedianMs: null,
    detectionP95Ms: null,
    classificationMinMs: null,
    classificationMedianMs: null,
    classificationP95Ms: null,
    startedAt: new Date().toISOString(),
    finalizedAt: null,
    createdAt: new Date().toISOString(),
    runs: [],
    readings: []
  };
  let created = false;

  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem("token", "qa-admin-token");
  });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      id: "admin",
      role: "ADMIN",
      email: "qa@example.invalid",
      fullName: "QA Admin",
      operationalClient: { id: "client-a", code: "AVIAT", name: "QA AVIAT" }
    })
  }));
  await page.route("**/api/admin/pda-test-sessions**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/admin/pda-test-sessions") {
      created = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ session, duplicate: false })
      });
      return;
    }
    if (request.method() === "GET" && path === "/api/admin/pda-test-sessions") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(created ? [session] : [])
      });
      return;
    }
    if (request.method() === "GET" && path.endsWith("/remote-qa")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ session: { id: session.id, testId }, runs: [] })
      });
      return;
    }
    if (request.method() === "POST" && path.endsWith("/pairings")) {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          manualCode: `PAIR-MOTO.${"A".repeat(26)}`,
          qrPayload: `LOGITEC-PDA1:PAIR-MOTO.${"B".repeat(43)}`,
          qrImageDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII="
        })
      });
      return;
    }
    if (request.method() === "GET" && path.endsWith(`/${testId}`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session)
      });
      return;
    }
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/pda-test-evidence.html");
  await page.locator("#newDeviceModel").fill("moto g86 POWER");
  await page.locator("#createSessionBtn").click();
  await expect(page.locator("#detailTitle")).toHaveText(testId);
  await expect(page.locator("#runsSummary")).toHaveText("Sin runs.");
  await page.locator("#pairBtn").click();
  await expect(page.locator("#remoteInviteUrl")).toHaveValue(/\/pda-pair\.html#p=/);
  expect(dialogs).toEqual([]);
  expect(pageErrors).toEqual([]);
});

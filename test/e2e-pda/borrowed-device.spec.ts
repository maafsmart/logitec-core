import { expect, test } from "@playwright/test";

test("PDA repite código, bloquea superficie y confirma devolución", async ({ page }) => {
  page.on("pageerror", (error) => console.error("PDA page error:", error.message));
  const attempts: Array<Record<string, unknown>> = [];
  const readings: Array<{ clientSeq: number; attemptId: string; result: string; createdAt: string }> = [];
  let released = false;
  let runCreated = false;
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
  await expect(page.locator("#privacyLock h2")).toHaveText("SAFE_TO_RETURN");
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
  await page.goto("/pda-pair.html?secret=must-disappear#ignored");
  await expect(page).toHaveURL(/\/pda-pair\.html$/);
  await page.locator("#pairingCode").fill(`PAIR-browser-test.${"A".repeat(26)}`);
  await page.locator("#exchangeBtn").click();
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

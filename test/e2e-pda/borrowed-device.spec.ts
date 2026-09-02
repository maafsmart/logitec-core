import { expect, test } from "@playwright/test";

test("PDA prestado repite código, limpia superficie y libera grant", async ({ page }) => {
  const attempts: Array<Record<string, unknown>> = [];
  let released = false;
  const run = {
    publicId: "RUN-browser-test",
    status: "ACTIVE",
    epoch: 1,
    version: 1,
    lastAcceptedSeq: 0,
    sealedThroughSeq: null,
    session: { testId: "PDA-20260902-BROWSER", status: "OPEN" }
  };

  await page.route("**/api/pda/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const body = request.postDataJSON?.() || {};
    if (path === "/api/pda/status") {
      await route.fulfill({
        status: released ? 401 : 200,
        contentType: "application/json",
        body: JSON.stringify(released
          ? { message: "Grant revocado", code: "PDA_GRANT_REVOKED" }
          : {
              grantPublicId: "GRANT-browser-test",
              sessionId: "session-browser",
              scopes: ["pda:run", "pda:capture", "pda:release"],
              expiresAt: "2026-09-02T18:00:00.000Z"
            })
      });
      return;
    }
    if (path === "/api/pda/runs" && request.method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ run }) });
      return;
    }
    if (path === `/api/pda/runs/${run.publicId}`) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(run) });
      return;
    }
    if (path === "/api/pda/readings") {
      attempts.push(body);
      run.lastAcceptedSeq = Number(body.clientSeq);
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
      run.status = "SEALED";
      run.sealedThroughSeq = Number(body.sealedThroughSeq);
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(run) });
      return;
    }
    if (path.endsWith("/reconcile")) {
      run.status = "RECONCILED";
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ reconciled: true, missing: [] }) });
      return;
    }
    if (path.endsWith("/release")) {
      released = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "SAFE_TO_RETURN" }) });
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
  expect(attempts[0]?.rawCode).toBe("SKU-REPETIDO");
  expect(attempts[1]?.rawCode).toBe("SKU-REPETIDO");
  expect(attempts[0]?.attemptId).not.toBe(attempts[1]?.attemptId);
  expect(attempts[0]?.idempotencyKey).not.toBe(attempts[1]?.idempotencyKey);
  expect(attempts.map((item) => item.clientSeq)).toEqual([1, 2]);

  await page.locator("#scanInput").fill("SENSIBLE-123456");
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.locator("#privacyCover")).toBeVisible();
  await expect(page.locator("#scanInput")).toHaveValue("");

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
  });
  await page.locator("#unlockBtn").click();
  await expect(page.locator("#labWorkspace")).toBeVisible();

  await page.locator("#finalizeBtn").click();
  await expect(page.locator("#accessGate")).toContainText("SAFE_TO_RETURN");
  expect(released).toBe(true);
});

test("pairing no coloca secreto en URL ni almacenamiento web", async ({ page }) => {
  let exchanged: Record<string, unknown> | null = null;
  await page.route("**/api/pda/pair/exchange", async (route) => {
    exchanged = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ testId: "PDA-20260902-PAIR", next: "/pda-scanner-lab.html" })
    });
  });
  await page.route("**/pda-scanner-lab.html", (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>paired</p>" })
  );
  await page.goto("/pda-pair.html?secret=must-disappear#secret");
  await expect(page).toHaveURL(/\/pda-pair\.html$/);
  await page.locator("#challengeId").fill("PAIR-browser-test");
  await page.locator("#pairSecret").fill("a".repeat(43));
  await page.locator("button[type=submit]").click();
  await expect(page).toHaveURL(/\/pda-scanner-lab\.html$/);
  expect(exchanged).toEqual({ challengeId: "PAIR-browser-test", secret: "a".repeat(43) });
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage)
  }));
  expect(storage).toEqual({ local: [], session: [] });
});

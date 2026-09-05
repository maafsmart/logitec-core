import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../public/hugo-operations-intake.html", import.meta.url), "utf8");
const js = readFileSync(new URL("../public/hugo-operations-intake.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/hugo-operations-intake.css", import.meta.url), "utf8");
const schemaSrc = readFileSync(new URL("../src/modules/operations-intake/operations-intake.schema.ts", import.meta.url), "utf8");
const appSrc = readFileSync(new URL("../src/app.ts", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");

const EXPECTED_SECTION_ORDER = [
  "recepcion-real",
  "proyectos-etiquetas",
  "buffer-entrada",
  "mover-reubicar",
  "preparar-salida",
  "procesos-administrativos",
  "excepciones",
  "inventario-auditorias",
  "reportes-cortes",
  "prioridad-frecuencia",
  "horario-operativo",
  "personas-roles",
  "procesos-no-contemplados"
];

test("artefactos estáticos documentan formulario operativo aislado", () => {
  assert.match(html, /Levantamiento operativo — Hugo, Ricardo y Alejandro/);
  assert.match(html, /LOGITEC Core WMS/);
  assert.match(html, /hugo-operations-intake\.css\?v=7/);
  assert.match(html, /hugo-operations-intake\.js\?v=7/);
  assert.match(html, /✓ Confirmar correcto y continuar/);
  assert.match(html, /Dejar pendiente/);
  assert.doesNotMatch(html, /Guardar borrador/);
  assert.doesNotMatch(html, /id="continueBtn"/);
  assert.doesNotMatch(html, /id="saveBtn"/);
  assert.match(html, /sectionHead/);
  assert.match(js, /confirmAndContinue/);
  assert.match(js, /pendingAndContinue/);
  assert.match(js, /advanceToNextSection/);
  assert.match(js, /scrollToSectionHead/);
  assert.match(js, /questionCode/);
  assert.match(js, /renderProjectSelect/);
  assert.match(js, /project-answer-grid/);
  assert.match(js, /Prefiero no contestar por este medio/);
  assert.doesNotMatch(js, /continueToNextSection/);
  assert.match(css, /\.question-number/);
  assert.match(css, /\.extras-toggle/);
  assert.match(appSrc, /hugo-operations-intake\.html/);
  assert.match(envExample, /ENABLE_HUGO_OPERATIONS_FORM/);
  assert.match(gitignore, /data\/operations-intake/);
});

test("schema tiene 13 secciones reordenadas con recepción primero y personas cerca del final", async () => {
  const { OPERATIONS_INTAKE_SECTIONS } = await import("../src/modules/operations-intake/operations-intake.schema.js");
  assert.equal(OPERATIONS_INTAKE_SECTIONS.length, 13);
  assert.deepEqual(
    OPERATIONS_INTAKE_SECTIONS.map((section) => section.id),
    EXPECTED_SECTION_ORDER
  );
  assert.equal(OPERATIONS_INTAKE_SECTIONS[0]?.id, "recepcion-real");
  assert.equal(OPERATIONS_INTAKE_SECTIONS[0]?.title, "Sección 1 — Recepción real de mercancía");
  assert.match(OPERATIONS_INTAKE_SECTIONS[0]?.intro || "", /cómo llega físicamente la mercancía/);
  const recepcion = OPERATIONS_INTAKE_SECTIONS[0];
  const arrivalField = recepcion?.fields.find((field) => field.id === "arrivalLabelState");
  assert.match(arrivalField?.label || "", /¿Cómo llega normalmente identificada/);
  assert.doesNotMatch(arrivalField?.label || "", /estado de etiqueta al llegar/);
  assert.ok(recepcion?.fields.some((field) => field.id === "labelGenerator"));
  assert.ok(recepcion?.fields.some((field) => field.id === "labelApplier"));
  assert.ok(recepcion?.fields.some((field) => field.kind === "project-select"));
  assert.ok(recepcion?.fields.some((field) => field.id === "arrivalByProjectAnswers"));
  assert.ok(recepcion?.fields.some((field) => field.id === "readyToScanProjects"));
  assert.ok(recepcion?.fields.some((field) => field.id === "receptionMissingStep"));
  assert.doesNotMatch(schemaSrc, /labelProducer/);
  assert.equal(OPERATIONS_INTAKE_SECTIONS[10]?.id, "horario-operativo");
  assert.match(OPERATIONS_INTAKE_SECTIONS[10]?.title || "", /Horario operativo y eventualidades/);
  assert.equal(OPERATIONS_INTAKE_SECTIONS[11]?.id, "personas-roles");
  assert.equal(OPERATIONS_INTAKE_SECTIONS[11]?.title, "Sección 12 — Personas y roles");
  assert.equal(OPERATIONS_INTAKE_SECTIONS.at(-1)?.id, "procesos-no-contemplados");
  assert.doesNotMatch(schemaSrc, /id: "intro"/);

  const personas = OPERATIONS_INTAKE_SECTIONS.find((section) => section.id === "personas-roles");
  const rolesField = personas?.fields.find((field) => field.id === "rolesPresent");
  assert.match(rolesField?.label || "", /participan actualmente en la operación/);
  assert.match(rolesField?.help || "", /responsabilidades necesarias/);
  assert.ok(personas?.fields.some((field) => field.id === "hugoNamePreference"));
  assert.ok(personas?.fields.some((field) => field.id === "ricardoNamePreference"));
  assert.ok(personas?.fields.some((field) => field.id === "alejandroNamePreference"));
  assert.ok(personas?.fields.some((field) => field.id === "aviatFloorRoleName"));
  assert.ok(personas?.fields.some((field) => field.id === "aviatLogitecRoleName"));
  assert.ok(personas?.fields.some((field) => field.id === "aviatMultipleImportant"));
  assert.ok(personas?.fields.some((field) => field.id === "roleActivitiesMode"));
  assert.doesNotMatch(schemaSrc, /Cantidad de representantes AVIAT/);

  const projectsSection = OPERATIONS_INTAKE_SECTIONS.find((section) => section.id === "proyectos-etiquetas");
  assert.ok(projectsSection?.fields.some((field) => field.kind === "project-cards"));
});

test("feature flag bloquea producción", () => {
  const featureSrc = readFileSync(
    new URL("../src/modules/operations-intake/operations-intake.feature.ts", import.meta.url),
    "utf8"
  );
  assert.match(featureSrc, /NODE_ENV === "production"/);
  assert.match(featureSrc, /DATABASE_ENVIRONMENT === "production"/);
  assert.match(featureSrc, /ENABLE_HUGO_OPERATIONS_FORM === "true"/);
});

test("store persiste matriz por campo y export conserva respuestas", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hugo-intake-"));
  try {
    const {
      createIntakeSession,
      readSession,
      saveSection,
      addAttachment,
      sessionToMarkdown
    } = await import("../src/modules/operations-intake/operations-intake.store.js");
    const { sectionTitleMap } = await import("../src/modules/operations-intake/operations-intake.schema.js");

    const session = await createIntakeSession(root);
    assert.ok(session.sessionId);

    const projectAnswers = {
      ATT: {
        formatStable: "Sí",
        arrivalFormat: "Excel",
        preLabeled: "A veces",
        labelFields: ["Pedido", "SAP"],
        fieldDetails: {
          Pedido: { presentation: "Código de barras", logitecAction: "Leer automáticamente" },
          SAP: { presentation: "Texto", logitecAction: "Validar" }
        },
        primaryIdentifier: "Combinación de campos",
        primaryIdentifierCombination: "Pedido + SAP",
        comment: "Etiqueta AVIAT estándar"
      }
    };

    const updated = await saveSection(root, session.sessionId, "proyectos-etiquetas", {
      status: "confirmed",
      respondents: { primary: "Hugo" },
      answers: { projectCards: projectAnswers },
      comments: {},
      flags: {}
    }, "FORM_SECTION_CONFIRMED");
    const att = updated.sections["proyectos-etiquetas"]?.answers.projectCards as Record<string, Record<string, unknown>>;
    assert.equal((att.ATT.fieldDetails as Record<string, unknown>).Pedido?.presentation, "Código de barras");

    await saveSection(root, session.sessionId, "horario-operativo", {
      status: "confirmed",
      respondents: { primary: "Hugo" },
      answers: { startWeekday: "8:00 a. m." },
      comments: { startWeekday: "Confirmado con Hugo" },
      flags: { startWeekday: ["No lo sabemos todavía"] }
    }, "FORM_SECTION_CONFIRMED");

    await saveSection(root, session.sessionId, "personas-roles", {
      status: "pending",
      respondents: { primary: "Ricardo" },
      answers: {
        rolesPresent: ["Hugo", "Ricardo"],
        hugoNamePreference: "Prefiero comentarlo personalmente",
        aviatFloorRoleName: "Implant",
        roleActivitiesMode: "Prefiero comentarlo personalmente"
      },
      comments: {},
      flags: {}
    }, "FORM_SECTION_PENDING");

    await addAttachment(root, session.sessionId, "recepcion-real", "section", {
      originalName: "zona.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fake-jpeg")
    });

    const loaded = await readSession(root, session.sessionId);
    assert.ok(loaded);
    assert.equal(loaded!.sections["personas-roles"]?.answers.aviatFloorRoleName, "Implant");
    assert.equal(loaded!.sections["horario-operativo"]?.answers.startWeekday, "8:00 a. m.");

    const markdown = sessionToMarkdown(loaded!, sectionTitleMap());
    assert.match(markdown, /sessionId:/);
    assert.match(markdown, /Recepción real de mercancía|recepcion-real/);
    assert.match(markdown, /Personas y roles/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

let server: http.Server;
let baseUrl = "";

before(async () => {
  process.env.NODE_ENV = "development";
  process.env.DATABASE_ENVIRONMENT = "development";
  process.env.ENABLE_HUGO_OPERATIONS_FORM = "true";
  process.env.HUGO_OPERATIONS_INTAKE_DIR = await mkdtemp(path.join(os.tmpdir(), "hugo-intake-http-"));
  const { app } = await import("../src/app.js");
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  if (process.env.HUGO_OPERATIONS_INTAKE_DIR) {
    await rm(process.env.HUGO_OPERATIONS_INTAKE_DIR, { recursive: true, force: true });
  }
});

async function request(pathname: string, init?: RequestInit) {
  const response = await fetch(`${baseUrl}${pathname}`, init);
  const text = await response.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* ignore non-json */
  }
  return { response, text, json };
}

test("routes aplican gate mediante isHugoOperationsFormEnabled", async () => {
  const routesSrc = readFileSync(
    new URL("../src/modules/operations-intake/operations-intake.routes.ts", import.meta.url),
    "utf8"
  );
  assert.match(routesSrc, /isHugoOperationsFormEnabled\(\)/);
  assert.match(routesSrc, /FORM_SECTION_SAVED/);
  assert.match(routesSrc, /listProjectsWithTimeout/);
});

test("HTTP: bootstrap inicia en recepción y conserva datos por sectionId", async () => {
  process.env.ENABLE_HUGO_OPERATIONS_FORM = "true";
  const bootstrap = await request("/api/operations-intake/bootstrap");
  assert.equal(bootstrap.response.status, 200);
  assert.equal(bootstrap.json.ok, true);
  const sections = bootstrap.json.sections as Array<{ id: string; title: string }>;
  assert.equal(sections.length, 13);
  assert.equal(sections[0]?.id, "recepcion-real");
  assert.equal(sections[0]?.title, "Sección 1 — Recepción real de mercancía");
  assert.equal(sections[11]?.id, "personas-roles");

  const created = await request("/api/operations-intake/sessions", { method: "POST" });
  assert.equal(created.response.status, 201);
  const sessionId = (created.json.session as { sessionId: string }).sessionId;

  const recepcion = await request(`/api/operations-intake/sessions/${sessionId}/sections/recepcion-real`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "confirm",
      respondents: { primary: "Hugo" },
      answers: {
        arrivalLabelState: "Depende del cliente/proyecto",
        arrivalByProjectProjects: ["ATT"],
        arrivalByProjectAnswers: { ATT: "Requiere nueva etiqueta" },
        labelGenerator: ["Logitec"],
        labelApplier: ["AVIAT"],
        readyToScan: "Sí",
        readyToScanProjects: ["ATT"]
      },
      comments: {},
      flags: {}
    })
  });
  assert.equal(recepcion.response.status, 200);
  assert.equal(recepcion.json.event, "FORM_SECTION_CONFIRMED");

  const horario = await request(`/api/operations-intake/sessions/${sessionId}/sections/horario-operativo`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "save",
      respondents: { primary: "Hugo" },
      answers: { startWeekday: "8:00 a. m." },
      comments: {},
      flags: {}
    })
  });
  assert.equal(horario.response.status, 200);
  assert.equal(horario.json.event, "FORM_SECTION_SAVED");

  const personas = await request(`/api/operations-intake/sessions/${sessionId}/sections/personas-roles`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "pending",
      respondents: { primary: "Ricardo" },
      answers: {
        rolesPresent: ["Operadores"],
        aviatFloorRoleName: "Implant",
        roleCanAuthorizeMode: "Lo puedo responder aquí",
        roleCanAuthorize: "Supervisor valida movimientos"
      },
      comments: {},
      flags: {}
    })
  });
  assert.equal(personas.response.status, 200);
  assert.equal(personas.json.event, "FORM_SECTION_PENDING");

  const exportJson = await request(`/api/operations-intake/sessions/${sessionId}/export.json`);
  assert.equal(exportJson.response.status, 200);
  assert.match(exportJson.text, /"recepcion-real"/);
  assert.match(exportJson.text, /"horario-operativo"/);
  assert.match(exportJson.text, /"aviatFloorRoleName"/);

  assert.match(exportJson.text, /"arrivalByProjectAnswers"/);
  assert.match(exportJson.text, /"labelGenerator"/);
  assert.match(exportJson.text, /"labelApplier"/);

  const page = await request("/hugo-operations-intake.html");
  assert.equal(page.response.status, 200);
  assert.match(page.text, /hugo-operations-intake.js\?v=7/);
  assert.match(page.text, /Confirmar correcto y continuar/);

  const jsAsset = await request("/hugo-operations-intake.js?v=7");
  assert.equal(jsAsset.response.status, 200);
  assert.match(jsAsset.text, /renderProjectAnswerGrid/);
});

test("HTTP: sesión resiliente — sin id, válido, 404 e id corrupto", async () => {
  process.env.ENABLE_HUGO_OPERATIONS_FORM = "true";

  const created = await request("/api/operations-intake/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(created.response.status, 201);
  const sessionId = (created.json.session as { sessionId: string }).sessionId;

  const hit = await request(`/api/operations-intake/sessions/${sessionId}`);
  assert.equal(hit.response.status, 200);

  const missing = await request(`/api/operations-intake/sessions/${sessionId}-missing`);
  assert.equal(missing.response.status, 404);

  const corrupt = await request("/api/operations-intake/sessions/not-a-valid-session-id");
  assert.equal(corrupt.response.status, 404);

  const reload = await request(`/api/operations-intake/sessions/${sessionId}`);
  assert.equal(reload.response.status, 200);

  const bootstrap = await request("/api/operations-intake/bootstrap");
  assert.equal(bootstrap.response.status, 200);
  const sections = bootstrap.json.sections as Array<{ id: string; title: string }>;
  assert.equal(sections[0]?.title, "Sección 1 — Recepción real de mercancía");
});

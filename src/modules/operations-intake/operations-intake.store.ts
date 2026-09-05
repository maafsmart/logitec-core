import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { operationsIntakeStorageRoot } from "./operations-intake.feature.js";

export type SectionStatus = "draft" | "confirmed" | "pending";

export type IntakeEventType =
  | "FORM_SECTION_SAVED"
  | "FORM_SECTION_CONFIRMED"
  | "FORM_SECTION_PENDING"
  | "FORM_SESSION_CREATED";

export type IntakeAttachment = {
  id: string;
  sectionId: string;
  fieldId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storedName: string;
  uploadedAt: string;
};

export type SectionRecord = {
  status: SectionStatus;
  respondents: Record<string, unknown>;
  answers: Record<string, unknown>;
  comments: Record<string, string>;
  flags: Record<string, string[]>;
  attachments: IntakeAttachment[];
  savedAt: string | null;
  confirmedAt: string | null;
};

export type IntakeSession = {
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  sections: Record<string, SectionRecord>;
  events: Array<{
    type: IntakeEventType;
    sectionId: string | null;
    timestamp: string;
    meta?: Record<string, unknown>;
  }>;
};

function sessionsDir(root: string) {
  return path.join(root, "sessions");
}

function attachmentsDir(root: string, sessionId: string) {
  return path.join(root, "attachments", sessionId);
}

function eventsFile(root: string) {
  return path.join(root, "events.jsonl");
}

function sessionPath(root: string, sessionId: string) {
  return path.join(sessionsDir(root), `${sessionId}.json`);
}

async function ensureRoot(root: string) {
  await mkdir(sessionsDir(root), { recursive: true });
  await mkdir(path.join(root, "attachments"), { recursive: true });
}

export function createEmptySection(): SectionRecord {
  return {
    status: "draft",
    respondents: {},
    answers: {},
    comments: {},
    flags: {},
    attachments: [],
    savedAt: null,
    confirmedAt: null
  };
}

export async function createIntakeSession(root: string): Promise<IntakeSession> {
  await ensureRoot(root);
  const now = new Date().toISOString();
  const session: IntakeSession = {
    sessionId: randomUUID(),
    createdAt: now,
    updatedAt: now,
    sections: {},
    events: []
  };
  await writeSession(root, session);
  await appendEvent(root, {
    type: "FORM_SESSION_CREATED",
    sectionId: null,
    timestamp: now,
    sessionId: session.sessionId
  });
  return session;
}

export async function readSession(root: string, sessionId: string): Promise<IntakeSession | null> {
  try {
    const raw = await readFile(sessionPath(root, sessionId), "utf8");
    return JSON.parse(raw) as IntakeSession;
  } catch {
    return null;
  }
}

async function writeSession(root: string, session: IntakeSession) {
  await ensureRoot(root);
  const target = sessionPath(root, session.sessionId);
  const temp = `${target}.tmp`;
  session.updatedAt = new Date().toISOString();
  await writeFile(temp, JSON.stringify(session, null, 2), "utf8");
  await rename(temp, target);
}

export async function appendEvent(
  root: string,
  event: {
    type: IntakeEventType;
    sectionId: string | null;
    timestamp: string;
    sessionId: string;
    meta?: Record<string, unknown>;
  }
) {
  await ensureRoot(root);
  await writeFile(eventsFile(root), `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
}

export async function saveSection(
  root: string,
  sessionId: string,
  sectionId: string,
  payload: {
    status: SectionStatus;
    respondents: Record<string, unknown>;
    answers: Record<string, unknown>;
    comments: Record<string, string>;
    flags: Record<string, string[]>;
  },
  eventType: IntakeEventType
): Promise<IntakeSession> {
  const session = await readSession(root, sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const now = new Date().toISOString();
  const previous = session.sections[sectionId] || createEmptySection();
  session.sections[sectionId] = {
    ...previous,
    status: payload.status,
    respondents: payload.respondents,
    answers: payload.answers,
    comments: payload.comments,
    flags: payload.flags,
    savedAt: now,
    confirmedAt: payload.status === "confirmed" ? now : previous.confirmedAt
  };
  session.events.push({ type: eventType, sectionId, timestamp: now });
  await writeSession(root, session);
  await appendEvent(root, {
    type: eventType,
    sectionId,
    timestamp: now,
    sessionId,
    meta: { status: payload.status }
  });
  return session;
}

export async function addAttachment(
  root: string,
  sessionId: string,
  sectionId: string,
  fieldId: string,
  file: { originalName: string; mimeType: string; buffer: Buffer }
): Promise<IntakeAttachment> {
  const session = await readSession(root, sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const section = session.sections[sectionId] || createEmptySection();
  const id = randomUUID();
  const sha256 = createHash("sha256").update(file.buffer).digest("hex");
  const safeExt = path.extname(file.originalName).slice(0, 12).replace(/[^a-zA-Z0-9.]/g, "");
  const storedName = `${id}${safeExt}`;
  const dir = attachmentsDir(root, sessionId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, storedName), file.buffer);
  const attachment: IntakeAttachment = {
    id,
    sectionId,
    fieldId,
    originalName: file.originalName,
    mimeType: file.mimeType,
    sizeBytes: file.buffer.length,
    sha256,
    storedName,
    uploadedAt: new Date().toISOString()
  };
  section.attachments = [...section.attachments.filter((item) => !(item.fieldId === fieldId && item.originalName === file.originalName)), attachment];
  session.sections[sectionId] = section;
  await writeSession(root, session);
  return attachment;
}

export async function listSessions(root: string): Promise<string[]> {
  await ensureRoot(root);
  const files = await readdir(sessionsDir(root));
  return files.filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""));
}

export function sessionToMarkdown(session: IntakeSession, sectionTitles: Record<string, string>): string {
  const lines = [
    `# LOGITEC — Levantamiento operativo Hugo / AVIAT`,
    ``,
    `- sessionId: ${session.sessionId}`,
    `- createdAt: ${session.createdAt}`,
    `- updatedAt: ${session.updatedAt}`,
    ``
  ];
  for (const [sectionId, record] of Object.entries(session.sections)) {
    lines.push(`## ${sectionTitles[sectionId] || sectionId}`);
    lines.push(`- status: ${record.status}`);
    lines.push(`- savedAt: ${record.savedAt || "—"}`);
    lines.push(`- confirmedAt: ${record.confirmedAt || "—"}`);
    lines.push("");
    lines.push("### Respondientes");
    lines.push("```json");
    lines.push(JSON.stringify(record.respondents, null, 2));
    lines.push("```");
    lines.push("");
    lines.push("### Respuestas");
    lines.push("```json");
    lines.push(JSON.stringify(record.answers, null, 2));
    lines.push("```");
    if (Object.keys(record.comments).length) {
      lines.push("");
      lines.push("### Comentarios");
      lines.push("```json");
      lines.push(JSON.stringify(record.comments, null, 2));
      lines.push("```");
    }
    if (record.attachments.length) {
      lines.push("");
      lines.push("### Adjuntos");
      for (const file of record.attachments) {
        lines.push(`- ${file.originalName} (${file.mimeType}, ${file.sizeBytes} bytes, field=${file.fieldId})`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

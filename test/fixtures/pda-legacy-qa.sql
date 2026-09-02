-- Synthetic-only fixture for migration QA.
-- Apply after migrations through 20260902070000 and before PDA protocol migrations.
INSERT INTO "Client" (
  "id", "name", "code", "active", "createdAt", "updatedAt"
) VALUES (
  'qa-client-aviat', 'QA AVIAT SYNTHETIC', 'AVIAT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "Client"
    WHERE "id" = 'qa-client-aviat' AND "code" = 'AVIAT'
  ) THEN
    RAISE EXCEPTION 'QA_AVIAT_FIXTURE_NOT_ISOLATED';
  END IF;
END $$;

INSERT INTO "Client" (
  "id", "name", "code", "active", "createdAt", "updatedAt"
) VALUES (
  'qa-client-beta', 'QA BETA SYNTHETIC', 'QABETA', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT INTO "User" (
  "id", "email", "passwordHash", "fullName", "role", "isActive", "createdAt", "updatedAt"
) VALUES
  ('qa-admin-a', 'qa-admin-a@example.invalid', 'synthetic-not-login', 'QA Admin A', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('qa-admin-b', 'qa-admin-b@example.invalid', 'synthetic-not-login', 'QA Admin B', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PdaTestSession" (
  "id", "clientId", "testId", "clientSessionKey", "status",
  "createdById", "createdAt", "updatedAt", "startedAt"
) VALUES
  ('qa-legacy-session-a', 'qa-client-aviat', 'PDA-20260902-LEGACY', 'legacy-session-key-a', 'FINALIZED', 'qa-admin-a', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('qa-legacy-session-b', 'qa-client-beta', 'PDA-20260902-LEGACY', 'legacy-session-key-b', 'OPEN', 'qa-admin-b', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "PdaTestReading" (
  "id", "sessionId", "clientId", "idempotencyKey", "requestFingerprint",
  "observedAt", "rawCode", "normalizedCode", "expectedType",
  "classification", "result", "captureMethod", "physicalZone", "createdById"
) VALUES
  ('qa-legacy-reading-a1', 'qa-legacy-session-a', 'qa-client-aviat', 'legacy-a-1', 'fp-a1', CURRENT_TIMESTAMP, 'QA-A-CODE-1', 'QA-A-CODE-1', 'SKU', 'SKU', 'OK', 'HID', 'QA-ZONE-A', 'qa-admin-a'),
  ('qa-legacy-reading-a2', 'qa-legacy-session-a', 'qa-client-aviat', 'legacy-a-2', 'fp-a2', CURRENT_TIMESTAMP + interval '1 second', 'QA-A-CODE-2', 'QA-A-CODE-2', 'SKU', 'NO_ENCONTRADO', 'RECONOCIDO_NO_ENCONTRADO', 'HID', 'QA-ZONE-A', 'qa-admin-a'),
  ('qa-legacy-reading-b1', 'qa-legacy-session-b', 'qa-client-beta', 'legacy-b-1', 'fp-b1', CURRENT_TIMESTAMP, 'QA-B-CODE-1', 'QA-B-CODE-1', 'SKU', 'SKU', 'OK', 'MANUAL', 'QA-ZONE-B', 'qa-admin-b');

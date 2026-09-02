-- Synthetic prerequisite for historical migration 20260829020000.
-- Apply after 20260829010000 in a fresh, isolated QA database.
INSERT INTO "Client" (
  "id", "name", "code", "active", "createdAt", "updatedAt"
) VALUES (
  'qa-client-aviat', 'QA AVIAT SYNTHETIC', 'AVIAT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

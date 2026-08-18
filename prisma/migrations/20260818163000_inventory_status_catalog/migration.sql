-- Data-only: ensure the four operational inventory statuses exist.
-- Does not alter schema, delete rows, or recreate the table.
INSERT INTO "InventoryStatusDefinition" (
  "code",
  "label",
  "active",
  "pickable",
  "description",
  "sortOrder",
  "createdAt",
  "updatedAt"
) VALUES
  ('AVAILABLE', 'AVAILABLE', true, NULL, NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('OPERATIONS', 'OPERATIONS', true, true, NULL, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('CUSTOMR OWNS', 'CUSTOMR OWNS', true, true, NULL, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ASO', 'ASO', true, true, NULL, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "active" = EXCLUDED."active",
  "pickable" = EXCLUDED."pickable",
  "sortOrder" = EXCLUDED."sortOrder";

-- Historical movement snapshots keep FREE_TO_SALE / LEGACY_UNASSIGNED.
-- New writes namespace those keys with clientId. Allow both forms.

ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_from_assignment_check";
ALTER TABLE "InventoryMovement" DROP CONSTRAINT IF EXISTS "InventoryMovement_to_assignment_check";

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_from_assignment_check" CHECK (
    "fromAssignmentType" IS NULL
    OR (
        "fromAssignmentType" = 'PROJECT'
        AND "fromProjectId" IS NOT NULL
        AND "fromAssignmentKey" = ('P:' || "fromProjectId")
    )
    OR (
        "fromAssignmentType" = 'FREE_TO_SALE'
        AND "fromProjectId" IS NULL
        AND (
            "fromAssignmentKey" = 'FREE_TO_SALE'
            OR "fromAssignmentKey" = ('FREE_TO_SALE:' || "clientId")
        )
    )
    OR (
        "fromAssignmentType" = 'LEGACY_UNASSIGNED'
        AND "fromProjectId" IS NULL
        AND (
            "fromAssignmentKey" = 'LEGACY_UNASSIGNED'
            OR "fromAssignmentKey" = ('LEGACY_UNASSIGNED:' || "clientId")
        )
    )
);

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_to_assignment_check" CHECK (
    "toAssignmentType" IS NULL
    OR (
        "toAssignmentType" = 'PROJECT'
        AND "toProjectId" IS NOT NULL
        AND "toAssignmentKey" = ('P:' || "toProjectId")
    )
    OR (
        "toAssignmentType" = 'FREE_TO_SALE'
        AND "toProjectId" IS NULL
        AND (
            "toAssignmentKey" = 'FREE_TO_SALE'
            OR "toAssignmentKey" = ('FREE_TO_SALE:' || "clientId")
        )
    )
    OR (
        "toAssignmentType" = 'LEGACY_UNASSIGNED'
        AND "toProjectId" IS NULL
        AND (
            "toAssignmentKey" = 'LEGACY_UNASSIGNED'
            OR "toAssignmentKey" = ('LEGACY_UNASSIGNED:' || "clientId")
        )
    )
);

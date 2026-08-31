import { Prisma } from "@prisma/client";

/** Columns that have existed since Client was created. ADMIN login does not read Client. */
export const clientPickerBaseSelect = {
  id: true,
  name: true,
  active: true,
  createdAt: true,
  updatedAt: true
} as const;

/** Identity fields used when the additive client migrations are present. */
export const clientPickerIdentitySelect = {
  ...clientPickerBaseSelect,
  code: true,
  legalName: true,
  tradeName: true
} as const;

export type ClientPickerRow = {
  id: string;
  name: string;
  active: boolean;
  createdAt?: Date;
  updatedAt?: Date;
  code?: string | null;
  legalName?: string | null;
  tradeName?: string | null;
  _count?: { projects: number };
};

export type ClientPickerDb = {
  client: {
    findMany: (args: Record<string, unknown>) => Promise<unknown[]>;
    findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  };
  $queryRaw?: (query: Prisma.Sql, ...values: unknown[]) => Promise<unknown>;
};

function isAuthBoundaryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as { statusCode?: unknown; status?: unknown; code?: unknown; name?: unknown };
  const status = value.statusCode ?? value.status;
  if (status === 401 || status === 403) return true;
  const code = typeof value.code === "string" ? value.code : "";
  if (
    code === "UNAUTHORIZED" ||
    code === "FORBIDDEN" ||
    code === "PASSWORD_CHANGE_REQUIRED" ||
    code === "USER_CLIENT_REQUIRED" ||
    code === "CLIENT_CONTEXT_INVALID"
  ) {
    return true;
  }
  const name = typeof value.name === "string" ? value.name : "";
  return name === "JsonWebTokenError" || name === "TokenExpiredError" || name === "NotBeforeError";
}

/** Schema lag: P2021/P2022 by `error.code`, without requiring Prisma instanceof. */
export function isMissingSchemaObjectError(error: unknown): boolean {
  if (isAuthBoundaryError(error)) return false;
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "P2021" || code === "P2022";
}

function asPickerRow(row: unknown): ClientPickerRow | null {
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;
  const count = value._count as { projects?: unknown } | undefined;
  return {
    id: value.id,
    name: value.name,
    active: value.active !== false,
    createdAt: value.createdAt instanceof Date ? value.createdAt : undefined,
    updatedAt: value.updatedAt instanceof Date ? value.updatedAt : undefined,
    code: typeof value.code === "string" ? value.code : value.code === null ? null : undefined,
    legalName: typeof value.legalName === "string" ? value.legalName : value.legalName === null ? null : undefined,
    tradeName: typeof value.tradeName === "string" ? value.tradeName : value.tradeName === null ? null : undefined,
    _count:
      count && typeof count.projects === "number" ? { projects: count.projects } : undefined
  };
}

function clampTake(take: number): number {
  const n = Number(take);
  if (!Number.isFinite(n)) return 200;
  return Math.min(200, Math.max(1, Math.trunc(n)));
}

function exactWhereId(where: Record<string, unknown>): string | undefined {
  if (!where || !Object.prototype.hasOwnProperty.call(where, "id")) return undefined;
  return typeof where.id === "string" ? where.id : "";
}

async function queryLegacyClientRows(
  db: ClientPickerDb,
  args: { id?: string; take: number }
): Promise<unknown[]> {
  if (typeof db.$queryRaw !== "function") {
    throw new Error("LEGACY_CLIENT_SQL_UNAVAILABLE");
  }
  const limit = clampTake(args.take);
  const rows =
    args.id !== undefined
      ? await db.$queryRaw(
          Prisma.sql`
            SELECT "id", "name", "active", "createdAt", "updatedAt"
            FROM "Client"
            WHERE "id" = ${args.id}
            ORDER BY "active" DESC, "name" ASC
            LIMIT ${limit}
          `
        )
      : await db.$queryRaw(
          Prisma.sql`
            SELECT "id", "name", "active", "createdAt", "updatedAt"
            FROM "Client"
            ORDER BY "active" DESC, "name" ASC
            LIMIT ${limit}
          `
        );
  return Array.isArray(rows) ? rows : [];
}

async function withSchemaFallback<T>(load: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!isMissingSchemaObjectError(error)) throw error;
    return fallback();
  }
}

async function withPrismaThenLegacySql<T>(
  prismaLoad: () => Promise<T>,
  legacyLoad: () => Promise<T>
): Promise<T> {
  try {
    return await prismaLoad();
  } catch (error) {
    if (!isMissingSchemaObjectError(error)) throw error;
    try {
      return await legacyLoad();
    } catch (legacyError) {
      if (legacyError instanceof Error && legacyError.message === "LEGACY_CLIENT_SQL_UNAVAILABLE") {
        throw error;
      }
      throw legacyError;
    }
  }
}

export async function findClientsForPicker(
  db: ClientPickerDb,
  args: { where: Record<string, unknown>; orderBy: unknown; take: number }
): Promise<ClientPickerRow[]> {
  const scopedId = exactWhereId(args.where);
  const rows = await withSchemaFallback(
    () =>
      db.client.findMany({
        ...args,
        select: {
          ...clientPickerIdentitySelect,
          _count: { select: { projects: true } }
        }
      }),
    () =>
      withSchemaFallback(
        () =>
          db.client.findMany({
            ...args,
            select: clientPickerIdentitySelect
          }),
        () =>
          withPrismaThenLegacySql(
            () =>
              db.client.findMany({
                ...args,
                select: clientPickerBaseSelect
              }),
            async () => {
              if (scopedId !== undefined && scopedId === "") return [];
              return queryLegacyClientRows(db, {
                id: scopedId,
                take: args.take
              });
            }
          )
      )
  );
  return (Array.isArray(rows) ? rows : []).map(asPickerRow).filter((row): row is ClientPickerRow => Boolean(row));
}

export async function findClientForSelect(db: ClientPickerDb, id: string): Promise<ClientPickerRow | null> {
  if (typeof id !== "string" || id.length === 0) return null;
  const row = await withSchemaFallback(
    () =>
      db.client.findUnique({
        where: { id },
        select: {
          ...clientPickerIdentitySelect,
          _count: { select: { projects: true } }
        }
      }),
    () =>
      withSchemaFallback(
        () =>
          db.client.findUnique({
            where: { id },
            select: clientPickerIdentitySelect
          }),
        () =>
          withPrismaThenLegacySql(
            () =>
              db.client.findUnique({
                where: { id },
                select: clientPickerBaseSelect
              }),
            async () => {
              const rows = await queryLegacyClientRows(db, { id, take: 1 });
              return rows[0] ?? null;
            }
          )
      )
  );
  return asPickerRow(row);
}

export function serializeOperationalClient(client: ClientPickerRow) {
  return {
    id: client.id,
    code: client.code || client.name,
    name: client.name,
    tradeName: client.tradeName ?? null,
    legalName: client.legalName ?? null,
    active: client.active
  };
}

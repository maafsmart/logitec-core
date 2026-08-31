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
};

export function isMissingSchemaObjectError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  );
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

async function withSchemaFallback<T>(load: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!isMissingSchemaObjectError(error)) throw error;
    return fallback();
  }
}

export async function findClientsForPicker(
  db: ClientPickerDb,
  args: { where: Record<string, unknown>; orderBy: unknown; take: number }
): Promise<ClientPickerRow[]> {
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
          db.client.findMany({
            ...args,
            select: clientPickerBaseSelect
          })
      )
  );
  return (Array.isArray(rows) ? rows : []).map(asPickerRow).filter((row): row is ClientPickerRow => Boolean(row));
}

export async function findClientForSelect(db: ClientPickerDb, id: string): Promise<ClientPickerRow | null> {
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
          db.client.findUnique({
            where: { id },
            select: clientPickerBaseSelect
          })
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

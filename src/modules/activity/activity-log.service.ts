import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export type LogActivityInput = {
  type: string;
  subtype?: string | null;
  reference?: string | null;
  userId?: string | null;
  productId?: string | null;
  customerId?: string | null;
  clientId?: string | null;
  warehouse?: string | null;
  location?: string | null;
  qty?: Prisma.Decimal | number | string | null;
  result?: string | null;
  metadata?: Prisma.InputJsonValue;
  taskId?: string | null;
};

async function writeActivity(input: LogActivityInput, tx?: Prisma.TransactionClient): Promise<void> {
  let qty: Prisma.Decimal | null = null;
  if (input.qty !== undefined && input.qty !== null) {
    qty = new Prisma.Decimal(String(input.qty));
  }

  const data: Prisma.ActivityLogUncheckedCreateInput = {
    type: input.type,
    subtype: input.subtype ?? null,
    reference: input.reference ?? null,
    userId: input.userId ?? null,
    productId: input.productId ?? null,
    customerId: input.customerId ?? null,
    clientId: input.clientId ?? null,
    warehouse: input.warehouse ?? null,
    location: input.location ?? null,
    qty,
    result: input.result ?? null,
    taskId: input.taskId ?? null
  };
  if (input.metadata !== undefined) {
    data.metadata = input.metadata;
  }
  await (tx ?? prisma).activityLog.create({ data });
}

/** Operational activity. Always stores the owning client. */
export async function logClientActivity(
  input: LogActivityInput & { clientId: string },
  tx?: Prisma.TransactionClient
): Promise<void> {
  await writeActivity(input, tx);
}

/** Truly global ADMIN activity (create client, manage users). Never appears in client traceability. */
export async function logGlobalAdminActivity(
  input: Omit<LogActivityInput, "clientId"> & { clientId?: null },
  tx?: Prisma.TransactionClient
): Promise<void> {
  await writeActivity({ ...input, clientId: null }, tx);
}

/** @deprecated Prefer logClientActivity or logGlobalAdminActivity. */
export async function logActivity(input: LogActivityInput, tx?: Prisma.TransactionClient): Promise<void> {
  await writeActivity(input, tx);
}

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middlewares/auth.middleware.js";
import { operationalClientId, requireNonClient, requireOperationalClient } from "../clients/client-scope.js";

const commentsRouter = Router();

const createCommentSchema = z.object({
  body: z.string().min(1),
  entityType: z.string().optional(),
  entityId: z.string().optional()
});

commentsRouter.post("/", requireAuth, requireOperationalClient, async (req, res) => {
  requireNonClient(req.auth!);
  const data = createCommentSchema.parse(req.body);

  const comment = await prisma.comment.create({
    data: {
      body: data.body,
      entityType: data.entityType,
      entityId: data.entityId,
      userId: req.auth!.userId,
      clientId: operationalClientId(req.auth!)
    }
  });

  res.json(comment);
});

commentsRouter.get("/", requireAuth, requireOperationalClient, async (req, res) => {
  requireNonClient(req.auth!);
  const { entityType, entityId } = req.query;

  const comments = await prisma.comment.findMany({
    where: {
      clientId: operationalClientId(req.auth!),
      entityType: entityType as string | undefined,
      entityId: entityId as string | undefined
    },
    orderBy: { createdAt: "desc" }
  });

  res.json(comments);
});

export { commentsRouter };
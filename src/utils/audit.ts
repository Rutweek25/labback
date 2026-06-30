import { prisma } from "../config/prisma";
import type { Prisma } from "@prisma/client";

interface AuditInput {
  actorId?: string;
  actorRole?: "DOCTOR" | "TECHNICIAN" | "ADMIN";
  entityType: string;
  entityId?: string;
  action: string;
  metadata?: Record<string, unknown>;
}

export const writeAuditLog = async (input: AuditInput) => {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });
  } catch (_error) {
    // audit logging must never break request flow
  }
};

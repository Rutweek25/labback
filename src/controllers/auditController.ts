import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";

export const listAuditLogs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { entityType, action, search } = req.query as Record<string, string>;

    const logs = await prisma.auditLog.findMany({
      where: {
        ...(entityType ? { entityType } : {}),
        ...(action ? { action } : {}),
        ...(search
          ? {
              OR: [
                { entityType: { contains: search, mode: "insensitive" } },
                { action: { contains: search, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
};
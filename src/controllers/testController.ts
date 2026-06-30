import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { writeAuditLog } from "../utils/audit";

export const createTest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, price } = req.body as { name: string; price: number };

    if (!name || Number(price) <= 0) {
      throw new ApiError(400, "Valid name and price are required");
    }

    const test = await prisma.test.create({
      data: {
        name,
        price: Number(price)
      }
    });

    res.status(201).json(test);
  } catch (error) {
    next(error);
  }
};

export const listTests = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tests = await prisma.test.findMany({ where: { isDeleted: false }, orderBy: { name: "asc" } });
    res.json(tests);
  } catch (error) {
    next(error);
  }
};

export const updateTest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    const { name, price } = req.body as { name?: string; price?: number };

    const existingTest = await prisma.test.findFirst({ where: { id, isDeleted: false } });
    if (!existingTest) {
      throw new ApiError(404, "Test not found");
    }

    // Only lab technicians are allowed to change test prices
    if (price !== undefined && req.user?.role !== "TECHNICIAN") {
      throw new ApiError(403, "Only lab technicians can edit test prices");
    }

    const test = await prisma.test.update({
      where: { id },
      data: {
        ...(name ? { name } : {}),
        ...(price ? { price: Number(price) } : {})
      }
    });

    await writeAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      entityType: "Test",
      entityId: String(id),
      action: "UPDATE",
      metadata: { name, price }
    });

    res.json(test);
  } catch (error) {
    next(error);
  }
};

export const deleteTest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id);
    await prisma.test.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });
    await writeAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      entityType: "Test",
      entityId: String(id),
      action: "SOFT_DELETE"
    });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

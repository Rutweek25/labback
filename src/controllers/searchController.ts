import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";

export const globalSearch = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) {
      return res.json({ patients: [], orders: [], reports: [] });
    }

    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(q);

    const [patients, orders, reports] = await Promise.all([
      prisma.patient.findMany({
        where: {
          isDeleted: false,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } }
          ]
        },
        take: 10,
        orderBy: { createdAt: "desc" }
      }),
      prisma.order.findMany({
        where: {
          isDeleted: false,
          OR: [
            { patient: { name: { contains: q, mode: "insensitive" } } },
            { patient: { phone: { contains: q, mode: "insensitive" } } },
            { reports: { some: { isDeleted: false, fileName: { contains: q, mode: "insensitive" } } } },
            { reports: { some: { isDeleted: false, status: { contains: q, mode: "insensitive" } } } },
            ...(isValidObjectId ? [{ id: q }] : [])
          ]
        },
        include: {
          patient: true,
          doctor: { select: { id: true, name: true } }
        },
        take: 10,
        orderBy: { createdAt: "desc" }
      }),
      prisma.report.findMany({
        where: {
          isDeleted: false,
          OR: [
            { fileName: { contains: q, mode: "insensitive" } },
            { status: { contains: q, mode: "insensitive" } },
            { order: { patient: { name: { contains: q, mode: "insensitive" } } } },
            { order: { patient: { phone: { contains: q, mode: "insensitive" } } } },
            ...(isValidObjectId ? [{ orderId: q }] : [])
          ]
        },
        include: {
          order: {
            include: {
              patient: true
            }
          }
        },
        take: 10,
        orderBy: { createdAt: "desc" }
      })
    ]);

    res.json({ patients, orders, reports });
  } catch (error) {
    next(error);
  }
};

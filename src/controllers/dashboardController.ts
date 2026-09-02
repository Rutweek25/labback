import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";

export const getAnalytics = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [payments, testUsage, orderCount] = await Promise.all([
      prisma.payment.findMany({
        where: {
          status: "PAID",
          isDeleted: false,
          order: { isDeleted: false }
        }
      }),
      prisma.orderTest.groupBy({
        by: ["testId"],
        where: {
          order: { isDeleted: false },
          test: { isDeleted: false }
        },
        _count: { testId: true },
        orderBy: { _count: { testId: "desc" } },
        take: 5
      }),
      prisma.order.count({ where: { isDeleted: false } })
    ]);

    const revenue = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    const testIds = testUsage.map((t) => t.testId);
    const tests = await prisma.test.findMany({ where: { id: { in: testIds }, isDeleted: false } });

    const testsById = Object.fromEntries(tests.map((t) => [t.id, t.name]));

    res.json({
      summary: {
        revenue,
        paidPayments: payments.length,
        orderCount
      },
      topTests: testUsage.map((t) => ({
        testId: t.testId,
        name: testsById[t.testId] ?? "Unknown",
        count: t._count.testId
      }))
    });
  } catch (error) {
    next(error);
  }
};

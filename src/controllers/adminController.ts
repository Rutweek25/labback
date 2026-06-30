import { NextFunction, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";

const toDateKey = (value: Date) => value.toISOString().slice(0, 10);

const groupByDate = (items: Array<{ createdAt: Date; amount?: number }>) => {
  const grouped = new Map<string, number>();
  for (const item of items) {
    const key = toDateKey(item.createdAt);
    const amount = Number(item.amount ?? 1);
    grouped.set(key, Number(grouped.get(key) ?? 0) + amount);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, value]) => ({ date, value }));
};

export const getAdminSummary = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [doctors, technicians, patientCount, orderCount, payments, tests, orders, allOrderTests, doctorOrders] = await Promise.all([
      prisma.user.count({ where: { role: "DOCTOR", isActive: true } }),
      prisma.user.count({ where: { role: "TECHNICIAN" } }),
      prisma.patient.count({ where: { isDeleted: false } }),
      prisma.order.count({ where: { isDeleted: false } }),
      prisma.payment.findMany({ where: { isDeleted: false }, orderBy: { createdAt: "desc" } }),
      prisma.test.findMany({ where: { isDeleted: false }, orderBy: { createdAt: "desc" }, take: 10 }),
      prisma.order.findMany({ where: { isDeleted: false }, select: { createdAt: true }, orderBy: { createdAt: "asc" } }),
      prisma.orderTest.findMany({
        where: {
          order: { isDeleted: false },
          test: { isDeleted: false }
        },
        include: {
          test: true
        }
      }),
      prisma.order.findMany({
        where: { isDeleted: false },
        include: {
          doctor: { select: { id: true, name: true } },
          payments: {
            where: { isDeleted: false },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 1
          }
        }
      })
    ]);

    const revenue = payments
      .filter((payment) => payment.status === "PAID")
      .reduce((sum: number, payment: { amount: unknown }) => sum + Number(payment.amount), 0);

    const pendingPayments = payments.filter((payment) => payment.status === "PENDING").length;
    const revenueOverTime = groupByDate(
      payments
        .filter((payment) => payment.status === "PAID")
        .map((payment) => ({ createdAt: payment.createdAt, amount: Number(payment.amount) }))
    );
    const ordersPerDay = groupByDate(orders.map((order) => ({ createdAt: order.createdAt, amount: 1 })));
    const paidCount = payments.filter((payment) => payment.status === "PAID").length;
    const pendingCount = payments.filter((payment) => payment.status === "PENDING").length;

    const testRevenueMap = new Map<string, number>();
    const testCountMap = new Map<string, number>();
    for (const item of allOrderTests) {
      const testName = item.test.name;
      testRevenueMap.set(testName, Number(testRevenueMap.get(testName) ?? 0) + Number(item.unitPrice));
      testCountMap.set(testName, Number(testCountMap.get(testName) ?? 0) + 1);
    }

    const revenueByTest = Array.from(testRevenueMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const topTests = Array.from(testCountMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    const doctorPerformanceMap = new Map<string, { orders: number; paidOrders: number }>();
    for (const order of doctorOrders) {
      const key = `${order.doctor.id}:${order.doctor.name}`;
      const current = doctorPerformanceMap.get(key) ?? { orders: 0, paidOrders: 0 };
      const latestPayment = order.payments[0];
      doctorPerformanceMap.set(key, {
        orders: current.orders + 1,
        paidOrders: current.paidOrders + (latestPayment?.status === "PAID" ? 1 : 0)
      });
    }

    const doctorPerformance = Array.from(doctorPerformanceMap.entries())
      .map(([key, value]) => {
        const [, name] = key.split(":");
        return {
          name,
          orders: value.orders,
          paidOrders: value.paidOrders
        };
      })
      .sort((a, b) => b.orders - a.orders)
      .slice(0, 8);

    res.json({
      cards: {
        totalDoctors: doctors,
        totalLabTechnicians: technicians,
        patientCount,
        orderCount,
        revenue,
        pendingPayments
      },
      charts: {
        revenueOverTime,
        ordersPerDay,
        revenueByTest,
        topTests,
        doctorPerformance,
        paymentStatusBreakdown: [
          { name: "PAID", value: paidCount },
          { name: "PENDING", value: pendingCount }
        ]
      },
      recentTests: tests
    });
  } catch (error) {
    next(error);
  }
};

export const listUsers = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(users);
  } catch (error) {
    next(error);
  }
};

export const createUserByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, role, password } = req.body as {
      name: string;
      email: string;
      role: "DOCTOR" | "TECHNICIAN" | "ADMIN";
      password?: string;
    };

    if (!name || !email || !role) {
      throw new ApiError(400, "Name, email and role are required");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(409, "Email already exists");
    }

    const hashedPassword = await bcrypt.hash(password || "password123", 10);
    const user = await prisma.user.create({
      data: {
        name,
        email,
        role,
        password: hashedPassword,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.status(201).json(user);
  } catch (error) {
    next(error);
  }
};

export const updateUserByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.id);
    const { name, email, role, password, isActive } = req.body as {
      name?: string;
      email?: string;
      role?: "DOCTOR" | "TECHNICIAN" | "ADMIN";
      password?: string;
      isActive?: boolean;
    };

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new ApiError(404, "User not found");
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(name ? { name } : {}),
        ...(email ? { email } : {}),
        ...(role ? { role } : {}),
        ...(typeof isActive === "boolean" ? { isActive } : {}),
        ...(password ? { password: await bcrypt.hash(password, 10) } : {})
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const deleteUserByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.id);
    if (req.user?.id === userId) {
      throw new ApiError(400, "You cannot delete your own account");
    }

    await prisma.user.delete({ where: { id: userId } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const toggleUserStatusByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = String(req.params.id);
    const { isActive } = req.body as { isActive: boolean };

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: Boolean(isActive) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const listTestsByAdmin = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const tests = await prisma.test.findMany({ where: { isDeleted: false }, orderBy: { name: "asc" } });
    res.json(tests);
  } catch (error) {
    next(error);
  }
};

export const createTestByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, price } = req.body as { name: string; price: number };
    if (!name || Number(price) <= 0) {
      throw new ApiError(400, "Valid name and price are required");
    }

    const test = await prisma.test.create({
      data: { name, price: Number(price) }
    });
    res.status(201).json(test);
  } catch (error) {
    next(error);
  }
};

export const updateTestByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const testId = String(req.params.id);
    const { name, price } = req.body as { name?: string; price?: number };
    // Admins are not allowed to change test prices; only lab technicians may.
    if (typeof price === "number") {
      throw new ApiError(403, "Only lab technicians can change test prices");
    }

    const test = await prisma.test.update({
      where: { id: testId },
      data: {
        ...(name ? { name } : {})
      }
    });
    res.json(test);
  } catch (error) {
    next(error);
  }
};

export const deleteTestByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const testId = String(req.params.id);
    await prisma.test.update({ where: { id: testId }, data: { isDeleted: true, deletedAt: new Date() } });
    res.status(204).send();
  } catch (error) {
    next(error);
  }
};

export const listPaymentsByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status, startDate, endDate } = req.query as {
      status?: "PAID" | "PENDING";
      startDate?: string;
      endDate?: string;
    };

    const payments = await prisma.payment.findMany({
      where: {
        isDeleted: false,
        order: { isDeleted: false },
        ...(status ? { status } : {}),
        ...(startDate || endDate
          ? {
              createdAt: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {})
              }
            }
          : {})
      },
      include: {
        order: {
          include: {
            patient: true,
            orderTests: { include: { test: true } }
          }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    const totalRevenue = payments
      .filter((payment) => payment.status === "PAID")
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const pendingPayments = payments.filter((payment) => payment.status === "PENDING").length;

    res.json({
      totalRevenue,
      pendingPayments,
      rows: payments.map((payment) => ({
        id: payment.id,
        orderId: payment.orderId,
        patientName: payment.order.patient.name,
        tests: payment.order.orderTests.map((ot) => ot.test.name),
        amount: Number(payment.amount),
        status: payment.status,
        method: payment.method,
        createdAt: payment.createdAt
      }))
    });
  } catch (error) {
    next(error);
  }
};

export const listReportsByAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query as { status?: "READY" };
    const reports = await prisma.report.findMany({
      where: {
        isDeleted: false,
        ...(status ? { status } : {})
      },
      include: {
        order: { include: { patient: true } }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    res.json(
      reports.map((report) => ({
        id: report.id,
        orderId: report.orderId,
        patientName: report.order.patient.name,
        status: report.status,
        fileName: report.fileName,
        fileUrl: report.fileUrl,
        createdAt: report.createdAt
      }))
    );
  } catch (error) {
    next(error);
  }
};

export const listOrdersByAdmin = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const orders = await prisma.order.findMany({
      where: { isDeleted: false },
      include: {
        patient: true,
        doctor: { select: { id: true, name: true, email: true } },
        orderTests: { include: { test: true } },
        payments: { where: { isDeleted: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] },
        reports: { where: { isDeleted: false }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    res.json(orders);
  } catch (error) {
    next(error);
  }
};

export const getSettings = async (_req: Request, res: Response) => {
  res.json({
    appName: "Lab Management System",
    currency: "Rs.",
    defaultRole: "DOCTOR",
    allowSelfRegistration: false
  });
};

export const updateSettings = async (req: Request, res: Response) => {
  const payload = req.body as {
    appName?: string;
    currency?: string;
    defaultRole?: "DOCTOR" | "TECHNICIAN" | "ADMIN";
    allowSelfRegistration?: boolean;
  };

  res.json({
    message: "Settings updated",
    settings: {
      appName: payload.appName || "Lab Management System",
      currency: payload.currency || "Rs.",
      defaultRole: payload.defaultRole || "DOCTOR",
      allowSelfRegistration: Boolean(payload.allowSelfRegistration)
    }
  });
};

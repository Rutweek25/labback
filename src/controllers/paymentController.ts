import { NextFunction, Request, Response } from "express";
import type { PaymentMethod, PaymentStatus } from "../types/domain";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { generateInvoicePdf } from "../utils/pdf";
import { getSocketServer } from "../config/socket";
import { writeAuditLog } from "../utils/audit";
import { pushNotification } from "../utils/notification";

const calculateOrderTotal = async (orderId: string) => {
  const orderTests = await prisma.orderTest.findMany({
    where: { orderId, order: { isDeleted: false } },
    include: { test: true }
  });

  return orderTests.reduce((sum: number, item: any) => sum + Number(item.unitPrice), 0);
};

export const createPayment = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.orderId);
    const { status, method, amount } = req.body as {
      status: PaymentStatus;
      method: PaymentMethod;
      amount?: number;
    };

    const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
    if (!order) {
      throw new ApiError(404, "Order not found");
    }

    const computedAmount = amount ? Number(amount) : await calculateOrderTotal(orderId);

    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: computedAmount,
        status,
        method,
        isDeleted: false
      }
    });

    const io = getSocketServer();
    io.emit("payment:updated", payment);
    await pushNotification({
      recipientIds: [order.doctorId],
      type: "PAYMENT_UPDATED",
      title: "Payment updated",
      message: `Payment ${status} for request #${orderId}`,
      entityType: "Payment",
      entityId: payment.id,
      metadata: { orderId, status }
    });
    await writeAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      entityType: "Payment",
      entityId: payment.id,
      action: "CREATE",
      metadata: { orderId, status }
    });
    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
};

export const listPayments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const status = req.query.status as PaymentStatus | undefined;
    const search = (req.query.search as string | undefined)?.trim();

    const orders = await prisma.order.findMany({
      where: {
        isDeleted: false,
        ...(search
          ? {
              patient: {
                OR: [
                  { name: { contains: search, mode: "insensitive" as const } },
                  { phone: { contains: search, mode: "insensitive" as const } }
                ]
              }
            }
          : {})
      },
      include: {
        patient: true,
        orderTests: { include: { test: true } },
        payments: {
          where: { isDeleted: false },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const rows = orders
      .map((order: any) => {
        const totalAmount = order.orderTests.reduce(
          (sum: number, item: any) => sum + Number(item.unitPrice),
          0
        );
        const latestPayment = order.payments[0];
        const paymentStatus = latestPayment?.status === "PAID" ? "PAID" : "PENDING";

        return {
          orderId: order.id,
          patientName: order.patient.name,
          phone: order.patient.phone,
          tests: order.orderTests.map((item: any) => item.test.name),
          totalAmount,
          paymentStatus
        };
      })
      .filter((row: { paymentStatus: string }) => (status ? row.paymentStatus === status : true));

    res.json(rows);
  } catch (error) {
    next(error);
  }
};

export const paymentHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.orderId);
    const payments = await prisma.payment.findMany({
      where: { orderId, isDeleted: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    res.json(payments);
  } catch (error) {
    next(error);
  }
};

export const generateInvoice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.orderId);

    const order = await prisma.order.findFirst({
      where: { id: orderId, isDeleted: false },
      include: {
        patient: true,
        orderTests: { include: { test: true } },
        payments: {
          where: { isDeleted: false },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1
        }
      }
    });

    if (!order) {
      throw new ApiError(404, "Order not found");
    }

    const total = order.orderTests.reduce((sum: number, item: any) => sum + Number(item.unitPrice), 0);
    const latestPayment = order.payments[0];

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=invoice-${orderId}.pdf`);

    generateInvoicePdf(res, {
      orderId: order.id,
      invoiceNumber: `INV-${String(order.id).padStart(6, "0")}`,
      patientName: order.patient.name,
      tests: order.orderTests.map((ot: any) => ({
        name: ot.test.name,
        price: Number(ot.unitPrice)
      })),
      amount: total,
      status: latestPayment?.status ?? "PENDING"
    });
  } catch (error) {
    next(error);
  }
};

export const updatePaymentStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.id);
    const { status } = req.body as { status: PaymentStatus };

    if (status !== "PAID" && status !== "PENDING") {
      throw new ApiError(400, "Invalid payment status");
    }

    const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
    if (!order) {
      throw new ApiError(404, "Order not found");
    }

    const totalAmount = await calculateOrderTotal(orderId);
    const latestPayment = await prisma.payment.findFirst({
      where: { orderId, isDeleted: false },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    const payment = latestPayment
      ? await prisma.payment.update({
          where: { id: latestPayment.id },
          data: { status, amount: totalAmount }
        })
      : await prisma.payment.create({
          data: {
            orderId,
            amount: totalAmount,
            status,
            method: "CASH",
            isDeleted: false
          }
        });

    const io = getSocketServer();
    io.emit("payment:updated", payment);
    await pushNotification({
      recipientIds: [order.doctorId],
      type: "PAYMENT_UPDATED",
      title: "Payment updated",
      message: `Payment ${status} for request #${orderId}`,
      entityType: "Payment",
      entityId: payment.id,
      metadata: { orderId, status }
    });
    await writeAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      entityType: "Payment",
      entityId: payment.id,
      action: "UPDATE_STATUS",
      metadata: { orderId, status }
    });
    res.json({ message: "Updated successfully", payment });
  } catch (error) {
    next(error);
  }
};

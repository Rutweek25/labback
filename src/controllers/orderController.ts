import { NextFunction, Request, Response } from "express";
import { orderStatuses, roles, sampleStatuses } from "../types/domain";
import type { OrderStatus, SampleStatus } from "../types/domain";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { getSocketServer } from "../config/socket";
import { getPagination } from "../utils/pagination";
import { writeAuditLog } from "../utils/audit";
import { pushNotification } from "../utils/notification";

const orderInclude = {
  patient: true,
  doctor: { select: { id: true, name: true } },
  orderTests: { include: { test: true } },
  payments: {
    where: { isDeleted: false },
    orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }]
  },
  reports: {
    where: { isDeleted: false },
    orderBy: { createdAt: "desc" as const }
  }
};

const getUpdatedLists = async (user: Express.User) => {
  const [patients, requests] = await Promise.all([
    prisma.patient.findMany({
      where: user.role === roles[0] ? { createdById: user.id, isDeleted: false } : { isDeleted: false },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    prisma.order.findMany({
      where: user.role === roles[0] ? { doctorId: user.id, isDeleted: false } : { isDeleted: false },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);

  return { patients, requests };
};

const createOrderWithTests = async (
  doctorId: string,
  patientId: string,
  testIds: string[]
) => {
  const tests = await prisma.test.findMany({ where: { id: { in: testIds }, isDeleted: false } });
  if (tests.length !== testIds.length) {
    throw new ApiError(400, "Some tests are invalid");
  }

  return prisma.order.create({
    data: {
      patientId,
      doctorId,
      status: orderStatuses[0],
      sampleStatus: sampleStatuses[0],
      orderTests: {
        create: tests.map((test: { id: string; price: any }) => ({
          testId: test.id,
          unitPrice: Number(test.price)
        }))
      }
    },
    include: orderInclude
  });
};

const buildUpdatedItems = async (
  testIds?: (string | number)[],
  testItems?: Array<{ testId: string | number; unitPrice: number }>
) => {
  if (testItems?.length) {
    return testItems.map((item) => ({
      testId: String(item.testId),
      unitPrice: Number(item.unitPrice)
    }));
  }

  if (testIds?.length) {
    const normalizedTestIds = testIds.map(String);
    const tests = await prisma.test.findMany({ where: { id: { in: normalizedTestIds }, isDeleted: false } });
    if (tests.length !== normalizedTestIds.length) {
      throw new ApiError(400, "Some tests are invalid");
    }

    return tests.map((test: { id: string; price: any }) => ({
      testId: test.id,
      unitPrice: Number(test.price)
    }));
  }

  return undefined;
};

const getTechnicianRecipientIds = async () => {
  const technicians = await prisma.user.findMany({
    where: { role: roles[1], isActive: true },
    select: { id: true }
  });

  return technicians.map((technician) => technician.id);
};

export const createOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const { patientId, testIds } = req.body as { patientId: string | number; testIds: (string | number)[] };

    if (!patientId || !testIds?.length) {
      throw new ApiError(400, "Patient and tests are required");
    }

    const order = await createOrderWithTests(req.user.id, String(patientId), testIds.map(String));
    const lists = await getUpdatedLists(req.user);

    const io = getSocketServer();
    io.to("role:TECHNICIAN").emit("order:new", order);
    await pushNotification({
      recipientIds: await getTechnicianRecipientIds(),
      type: "ORDER_CREATED",
      title: "New request created",
      message: `Request #${order.id} was created for ${order.patient.name}`,
      entityType: "Order",
      entityId: order.id,
      metadata: { patientId: order.patientId, testIds }
    });

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: order.id,
      action: "CREATE",
      metadata: { patientId: order.patientId, testIds }
    });

    res.status(201).json({
      message: "Order created successfully",
      order,
      lists
    });
  } catch (error) {
    next(error);
  }
};

export const createOrderWithPatient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const {
      patient,
      testIds
    } = req.body as {
      patient: { name: string; phone: string; age: number; gender: string };
      testIds: (string | number)[];
    };

    if (!patient?.name || !patient?.phone || !patient?.age || !patient?.gender || !testIds?.length) {
      throw new ApiError(400, "Patient details and tests are required");
    }

    const normalizedPhone = String(patient.phone || "").trim();
    const parsedAge = Number(patient.age);

    if (!/^\d{10}$/.test(normalizedPhone)) {
      throw new ApiError(400, "Phone number must be exactly 10 digits");
    }

    if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
      throw new ApiError(400, "Age must be a valid numeric value");
    }

    const existingPatient = await prisma.patient.findFirst({ where: { phone: normalizedPhone, isDeleted: false } });

    const resolvedPatient =
      existingPatient ??
      (await prisma.patient.create({
        data: {
          name: patient.name,
          phone: normalizedPhone,
          age: parsedAge,
          gender: patient.gender,
          createdById: req.user.id
        }
      }));

    const order = await createOrderWithTests(req.user.id, resolvedPatient.id, testIds.map(String));
    const lists = await getUpdatedLists(req.user);

    const io = getSocketServer();
    io.to("role:TECHNICIAN").emit("order:new", order);
    await pushNotification({
      recipientIds: await getTechnicianRecipientIds(),
      type: "ORDER_CREATED",
      title: "New request created",
      message: `Request #${order.id} was created for ${order.patient.name}`,
      entityType: "Order",
      entityId: order.id,
      metadata: { patientPhone: normalizedPhone, testIds }
    });

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: order.id,
      action: "CREATE_WITH_PATIENT",
      metadata: { patientPhone: normalizedPhone, testIds }
    });

    res.status(201).json({
      message: "Patient and request created successfully",
      order,
      lists
    });
  } catch (error) {
    next(error);
  }
};

export const createOrderForExistingPatient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const { patientId, testIds } = req.body as { patientId: string | number; testIds: (string | number)[] };
    if (!patientId || !testIds?.length) {
      throw new ApiError(400, "Patient and tests are required");
    }

    const existingPatient = await prisma.patient.findFirst({ where: { id: String(patientId), isDeleted: false } });
    if (!existingPatient) {
      throw new ApiError(404, "Patient not found");
    }

    const order = await createOrderWithTests(req.user.id, existingPatient.id, testIds.map(String));
    const lists = await getUpdatedLists(req.user);

    const io = getSocketServer();
    io.to("role:TECHNICIAN").emit("order:new", order);
    await pushNotification({
      recipientIds: await getTechnicianRecipientIds(),
      type: "ORDER_CREATED",
      title: "New request created",
      message: `Request #${order.id} was created for ${order.patient.name}`,
      entityType: "Order",
      entityId: order.id,
      metadata: { patientId: existingPatient.id, testIds }
    });

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: order.id,
      action: "CREATE_FOR_EXISTING_PATIENT",
      metadata: { patientId: existingPatient.id, testIds }
    });

    res.status(201).json({
      message: "Request created successfully",
      order,
      lists
    });
  } catch (error) {
    next(error);
  }
};

export const listOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const { status, page, pageSize, search } = req.query as Record<string, string>;
    const { skip, page: currentPage, pageSize: perPage } = getPagination(page, pageSize);

    const where = {
      isDeleted: false,
      ...(req.user.role === roles[0] ? { doctorId: req.user.id } : {}),
      ...(status ? { status: status as OrderStatus } : {}),
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
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage
      }),
      prisma.order.count({ where })
    ]);

    res.json({
      data: orders,
      pagination: {
        total,
        page: currentPage,
        pageSize: perPage,
        totalPages: Math.ceil(total / perPage)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.id);
    const { status, testItems } = req.body as {
      status?: OrderStatus;
      testIds?: (string | number)[];
      testItems?: Array<{ testId: string | number; unitPrice: number }>;
    };

    const existingOrder = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
    if (!existingOrder) {
      throw new ApiError(404, "Order not found");
    }

    if (
      req.user?.role === roles[0] &&
      existingOrder.doctorId !== req.user.id
    ) {
      throw new ApiError(403, "You can edit only your own requests");
    }

    const updatedItems = await buildUpdatedItems(
      req.body.testIds as (string | number)[] | undefined,
      testItems
    );

    if ((req.body.testIds || testItems) && (!updatedItems || !updatedItems.length)) {
      throw new ApiError(400, "At least one test is required");
    }

    const updatedOrder = await prisma.$transaction(async (tx: any) => {
      if (updatedItems) {
        await tx.orderTest.deleteMany({ where: { orderId } });
        await tx.orderTest.createMany({
          data: updatedItems.map((item: { testId: string; unitPrice: number }) => ({
            orderId,
            testId: item.testId,
            unitPrice: Number(item.unitPrice)
          }))
        });
      }

      return tx.order.update({
        where: { id: orderId },
        data: {
          ...(status ? { status } : {})
        },
        include: orderInclude
      });
    });

    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const lists = await getUpdatedLists(req.user);

    getSocketServer().emit("order:updated", updatedOrder);
    await writeAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE",
      metadata: { status, hasTestItems: Boolean(updatedItems) }
    });
    res.json({
      message: "Order updated successfully",
      order: updatedOrder,
      lists
    });
  } catch (error) {
    next(error);
  }
};

export const deleteOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const orderId = String(req.params.id);
    const existingOrder = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
    if (!existingOrder) {
      throw new ApiError(404, "Order not found");
    }

    if (req.user.role === roles[0] && existingOrder.doctorId !== req.user.id) {
      throw new ApiError(403, "You can delete only your own requests");
    }

    await prisma.order.update({ where: { id: orderId }, data: { isDeleted: true, deletedAt: new Date() } });
    const lists = await getUpdatedLists(req.user);

    getSocketServer().emit("order:updated", { id: orderId, deleted: true });
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: orderId,
      action: "SOFT_DELETE"
    });
    res.json({
      message: "Order deleted successfully",
      deletedOrderId: orderId,
      lists
    });
  } catch (error) {
    next(error);
  }
};

export const updateOrderTestsByLab = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== roles[1]) {
      throw new ApiError(403, "Forbidden");
    }

    const orderId = String(req.params.id);
    const { testIds, testItems } = req.body as {
      testIds?: (string | number)[];
      testItems?: Array<{ testId: string | number; unitPrice: number }>;
    };

    if (!testIds?.length && !testItems?.length) {
      throw new ApiError(400, "At least one test is required");
    }

    const updatedOrder = await prisma.$transaction(async (tx: any) => {
      const resolvedIds = testItems?.length
        ? testItems.map((item) => String(item.testId))
        : (testIds as (string | number)[]).map(String);

      const tests = await tx.test.findMany({ where: { id: { in: resolvedIds }, isDeleted: false } });
      if (tests.length !== resolvedIds.length) {
        throw new ApiError(400, "Some tests are invalid");
      }

      const priceByTestId = new Map<string, number>();
      if (testItems?.length) {
        for (const item of testItems) {
          const price = Number(item.unitPrice);
          if (!Number.isFinite(price) || price < 0) {
            throw new ApiError(400, "Invalid unit price");
          }
          priceByTestId.set(String(item.testId), price);
        }
      }

      await tx.orderTest.deleteMany({ where: { orderId } });
      await tx.orderTest.createMany({
        data: tests.map((test: { id: string; price: any }) => ({
          orderId,
          testId: test.id,
          unitPrice: priceByTestId.has(test.id)
            ? Number(priceByTestId.get(test.id))
            : Number(test.price)
        }))
      });

      return tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
    });

    if (!updatedOrder) {
      throw new ApiError(404, "Order not found");
    }

    getSocketServer().emit("order:updated", updatedOrder);
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE_TESTS_BY_LAB"
    });
    res.json({ message: "Updated successfully", order: updatedOrder });
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatusByLab = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== roles[1]) {
      throw new ApiError(403, "Forbidden");
    }

    const orderId = String(req.params.id);
    const { status } = req.body as { status: OrderStatus };
    if (!status || !orderStatuses.includes(status)) {
      throw new ApiError(400, "Invalid order status");
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { status },
      include: orderInclude
    });

    getSocketServer().emit("order:updated", order);
    await pushNotification({
      recipientIds: [order.doctorId],
      type: "ORDER_STATUS_UPDATED",
      title: "Request status updated",
      message: `Request #${orderId} is now ${status}`,
      entityType: "Order",
      entityId: orderId,
      metadata: { status }
    });
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE_STATUS_BY_LAB",
      metadata: { status }
    });
    res.json({ message: "Updated successfully", order });
  } catch (error) {
    next(error);
  }
};

export const updateOrderSampleStatusByLab = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== roles[1]) {
      throw new ApiError(403, "Forbidden");
    }

    const orderId = String(req.params.id);
    const { sampleStatus } = req.body as { sampleStatus: SampleStatus };

    if (!sampleStatus || !sampleStatuses.includes(sampleStatus)) {
      throw new ApiError(400, "Invalid sample status");
    }

    const order = await prisma.order.update({
      where: { id: orderId },
      data: { sampleStatus } as any,
      include: orderInclude
    });

    getSocketServer().emit("order:updated", order);
    await pushNotification({
      recipientIds: [order.doctorId],
      type: "SAMPLE_STATUS_UPDATED",
      title: "Sample status updated",
      message: `Request #${orderId} sample is now ${sampleStatus}`,
      entityType: "Order",
      entityId: orderId,
      metadata: { sampleStatus }
    });
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: orderId,
      action: "UPDATE_SAMPLE_STATUS_BY_LAB",
      metadata: { sampleStatus }
    });

    res.json({ message: "Updated successfully", order });
  } catch (error) {
    next(error);
  }
};

export const deleteOrderByLab = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== roles[1]) {
      throw new ApiError(403, "Forbidden");
    }

    const orderId = String(req.params.id);
    const existingOrder = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
    if (!existingOrder) {
      throw new ApiError(404, "Order not found");
    }

    await prisma.order.update({ where: { id: orderId }, data: { isDeleted: true, deletedAt: new Date() } });
    getSocketServer().emit("order:updated", { id: orderId, deleted: true });
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Order",
      entityId: orderId,
      action: "SOFT_DELETE_BY_LAB"
    });
    res.json({ message: "Deleted successfully", deletedOrderId: orderId });
  } catch (error) {
    next(error);
  }
};

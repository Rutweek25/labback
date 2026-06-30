import { NextFunction, Request, Response } from "express";
import path from "path";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { getSocketServer } from "../config/socket";
import { writeAuditLog } from "../utils/audit";
import { pushNotification } from "../utils/notification";
import { reportStatuses } from "../types/domain";

export const uploadReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.orderId || req.body.orderId || "");

    if (!req.file) {
      throw new ApiError(400, "Report file is required");
    }

    if (!orderId) {
      throw new ApiError(400, "Order ID is required");
    }

    const order = await prisma.order.findFirst({ where: { id: orderId, isDeleted: false } });
    if (!order) {
      throw new ApiError(404, "Order not found");
    }

    const existingReports = await prisma.report.findMany({ where: { orderId, isDeleted: false } });
    if (existingReports.length) {
      await prisma.report.updateMany({
        where: { orderId, isDeleted: false },
        data: { isDeleted: true, deletedAt: new Date() }
      });
    }

    const fileName = req.file.filename;

    const report = await prisma.report.create({
      data: {
        orderId,
        fileName: req.file.originalname,
        fileUrl: `/uploads/reports/${fileName}`,
        filePath: req.file.path,
        fileType: req.file.mimetype,
        status: "UPLOADED" as any,
        isDeleted: false
      }
    });

    const io = getSocketServer();
    io.emit("report:uploaded", report);
    await pushNotification({
      recipientIds: [order.doctorId],
      type: "REPORT_UPLOADED",
      title: "Report uploaded",
      message: `A new report is available for request #${orderId}`,
      entityType: "Report",
      entityId: report.id,
      metadata: { orderId, reportId: report.id }
    });
    await writeAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      entityType: "Report",
      entityId: report.id,
      action: "UPLOAD",
      metadata: { orderId }
    });

    res.status(201).json({ message: "Updated successfully", report });
  } catch (error) {
    next(error);
  }
};

export const listReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderId = String(req.params.orderId);

    const reports = await prisma.report.findMany({
      where: { orderId, isDeleted: false },
      orderBy: { createdAt: "desc" }
    });

    res.json(reports);
  } catch (error) {
    next(error);
  }
};

export const downloadReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = String(req.params.id);
    const report = await prisma.report.findFirst({ where: { id: reportId, isDeleted: false } });

    if (!report) {
      throw new ApiError(404, "Report not found");
    }

    const filePath = path.resolve(report.filePath);
    res.download(filePath, report.fileName);
  } catch (error) {
    next(error);
  }
};

export const updateReportStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = String(req.params.id);
    const { status } = req.body as { status: string };

    if (!status || !reportStatuses.includes(status as (typeof reportStatuses)[number])) {
      throw new ApiError(400, "Invalid report status");
    }

    const existing = await prisma.report.findFirst({
      where: { id: reportId, isDeleted: false },
      include: { order: true }
    });

    if (!existing) {
      throw new ApiError(404, "Report not found");
    }

    const report = await prisma.report.update({
      where: { id: reportId },
      data: { status: status as any }
    });

    getSocketServer().emit("report:updated", report);
    await pushNotification({
      recipientIds: [existing.order.doctorId],
      type: "REPORT_STATUS_UPDATED",
      title: "Report status updated",
      message: `Report #${reportId} is now ${status}`,
      entityType: "Report",
      entityId: reportId,
      metadata: { status }
    });

    res.json({ message: "Report status updated", report });
  } catch (error) {
    next(error);
  }
};

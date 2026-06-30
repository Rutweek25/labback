import { NextFunction, Request, Response } from "express";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { getPagination } from "../utils/pagination";
import { writeAuditLog } from "../utils/audit";

export const createPatient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, phone, age, gender } = req.body as {
      name: string;
      phone: string;
      age: number;
      gender: string;
    };

    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const normalizedPhone = String(phone || "").trim();
    const parsedAge = Number(age);

    if (!name || !normalizedPhone || !age || !gender) {
      throw new ApiError(400, "All fields are required");
    }

    if (!/^\d{10}$/.test(normalizedPhone)) {
      throw new ApiError(400, "Phone number must be exactly 10 digits");
    }

    if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
      throw new ApiError(400, "Age must be a valid numeric value");
    }

    const patient = await prisma.patient.create({
      data: {
        name,
        phone: normalizedPhone,
        age: parsedAge,
        gender,
        createdById: req.user.id
      }
    });

    res.status(201).json(patient);
  } catch (error) {
    next(error);
  }
};

export const listPatients = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, page, pageSize } = req.query as Record<string, string>;
    const { skip, page: currentPage, pageSize: perPage } = getPagination(page, pageSize);

    const where = search
      ? {
          isDeleted: false,
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { phone: { contains: search, mode: "insensitive" as const } }
          ]
        }
      : { isDeleted: false };

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where,
        include: { createdBy: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: perPage
      }),
      prisma.patient.count({ where })
    ]);

    res.json({
      data: patients,
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

export const deletePatient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const patientId = String(req.params.id);
    const patient = await prisma.patient.findFirst({ where: { id: patientId, isDeleted: false } });
    if (!patient) {
      throw new ApiError(404, "Patient not found");
    }

    const orderCount = await prisma.order.count({ where: { patientId, isDeleted: false } });
    if (orderCount > 0) {
      throw new ApiError(409, "Cannot delete patient with existing requests");
    }

    await prisma.patient.update({
      where: { id: patientId },
      data: { isDeleted: true, deletedAt: new Date() }
    });
    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Patient",
      entityId: patientId,
      action: "SOFT_DELETE"
    });

    const patients = await prisma.patient.findMany({
      where: req.user.role === "DOCTOR" ? { createdById: req.user.id, isDeleted: false } : { isDeleted: false },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      message: "Patient deleted successfully",
      deletedPatientId: patientId,
      patients
    });
  } catch (error) {
    next(error);
  }
};

export const updatePatient = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized");
    }

    const patientId = String(req.params.id);
    const { name, phone, age, gender } = req.body as {
      name: string;
      phone: string;
      age: number;
      gender: string;
    };

    const patient = await prisma.patient.findFirst({ where: { id: patientId, isDeleted: false } });
    if (!patient) {
      throw new ApiError(404, "Patient not found");
    }

    if (req.user.role === "DOCTOR" && patient.createdById !== req.user.id) {
      throw new ApiError(403, "You are not allowed to update this patient");
    }

    const normalizedName = String(name || "").trim();
    const normalizedPhone = String(phone || "").trim();
    const normalizedGender = String(gender || "").trim();
    const parsedAge = Number(age);

    if (!normalizedName || !normalizedPhone || !normalizedGender || !parsedAge) {
      throw new ApiError(400, "All fields are required");
    }

    if (!/^\d{10}$/.test(normalizedPhone)) {
      throw new ApiError(400, "Phone number must be exactly 10 digits");
    }

    if (!Number.isInteger(parsedAge) || parsedAge <= 0) {
      throw new ApiError(400, "Age must be a valid numeric value");
    }

    const updatedPatient = await prisma.patient.update({
      where: { id: patientId },
      data: {
        name: normalizedName,
        phone: normalizedPhone,
        age: parsedAge,
        gender: normalizedGender
      }
    });

    await writeAuditLog({
      actorId: req.user.id,
      actorRole: req.user.role,
      entityType: "Patient",
      entityId: patientId,
      action: "UPDATE",
      metadata: {
        name: updatedPatient.name,
        phone: updatedPatient.phone,
        age: updatedPatient.age,
        gender: updatedPatient.gender
      }
    });

    const patients = await prisma.patient.findMany({
      where: req.user.role === "DOCTOR" ? { createdById: req.user.id, isDeleted: false } : { isDeleted: false },
      orderBy: { createdAt: "desc" }
    });

    res.json({
      message: "Patient updated successfully",
      patient: updatedPatient,
      patients
    });
  } catch (error) {
    next(error);
  }
};

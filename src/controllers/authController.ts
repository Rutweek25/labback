import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { Role, roles } from "../types/domain";
import { prisma } from "../config/prisma";
import { ApiError } from "../utils/ApiError";
import { signToken } from "../utils/jwt";
import { writeAuditLog } from "../utils/audit";
import { sendOptionalEmail } from "../utils/email";
import { env } from "../config/env";

type PendingRegistration = {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  otp: string;
  expiresAt: number;
};

const OTP_TTL_MS = 10 * 60 * 1000;
const pendingRegistrations = new Map<string, PendingRegistration>();

const generateOtp = () => `${Math.floor(100000 + Math.random() * 900000)}`;

const buildOtpEmailText = (name: string, otp: string) => {
  return [
    `Hi ${name},`,
    "",
    "Your verification code for Lab Management System is:",
    otp,
    "",
    "This code expires in 10 minutes.",
    "",
    "If you did not request this, you can ignore this email."
  ].join("\n");
};

export const register = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, email, password, role } = req.body as {
      name: string;
      email: string;
      password: string;
      role: Role;
    };

    if (!name || !email || !password || !role) {
      throw new ApiError(400, "All fields are required");
    }

    if (!roles.includes(role)) {
      throw new ApiError(400, "Invalid role");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      throw new ApiError(409, "Email already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const otp = generateOtp();

    pendingRegistrations.set(normalizedEmail, {
      name,
      email: normalizedEmail,
      passwordHash: hashedPassword,
      role,
      otp,
      expiresAt: Date.now() + OTP_TTL_MS
    });

    const emailSent = await sendOptionalEmail(
      normalizedEmail,
      "Verify your Lab Management account",
      buildOtpEmailText(name, otp)
    );

    if (!emailSent && env.NODE_ENV === "production") {
      pendingRegistrations.delete(normalizedEmail);
      throw new ApiError(500, "SMTP is not configured. Unable to send OTP email.");
    }

    res.status(201).json({
      message: "OTP sent to your email. Please verify to complete registration.",
      email: normalizedEmail
    });

    await writeAuditLog({
      entityType: "Auth",
      action: "REGISTER_OTP_SENT",
      metadata: { email: normalizedEmail, role }
    });
  } catch (error) {
    next(error);
  }
};

export const verifyRegistrationOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body as { email: string; otp: string };
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedOtp = String(otp || "").trim();

    if (!normalizedEmail || !normalizedOtp) {
      throw new ApiError(400, "Email and OTP are required");
    }

    const pending = pendingRegistrations.get(normalizedEmail);
    if (!pending) {
      throw new ApiError(400, "No pending registration found. Please register again.");
    }

    if (Date.now() > pending.expiresAt) {
      pendingRegistrations.delete(normalizedEmail);
      throw new ApiError(400, "OTP expired. Please request a new one.");
    }

    if (pending.otp !== normalizedOtp) {
      throw new ApiError(400, "Invalid OTP");
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      pendingRegistrations.delete(normalizedEmail);
      throw new ApiError(409, "Email already exists");
    }

    const user = await prisma.user.create({
      data: {
        name: pending.name,
        email: pending.email,
        role: pending.role,
        password: pending.passwordHash,
        isActive: false
      }
    });

    pendingRegistrations.delete(normalizedEmail);

    res.status(201).json({
      message: "Email verified successfully. Your account is pending admin approval.",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
      }
    });

    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      entityType: "User",
      entityId: user.id,
      action: "REGISTER_VERIFIED_PENDING_APPROVAL"
    });
  } catch (error) {
    next(error);
  }
};

export const resendRegistrationOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email: string };
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      throw new ApiError(400, "Email is required");
    }

    const pending = pendingRegistrations.get(normalizedEmail);
    if (!pending) {
      throw new ApiError(400, "No pending registration found. Please register again.");
    }

    const otp = generateOtp();
    pendingRegistrations.set(normalizedEmail, {
      ...pending,
      otp,
      expiresAt: Date.now() + OTP_TTL_MS
    });

    const emailSent = await sendOptionalEmail(
      normalizedEmail,
      "Your new verification code",
      buildOtpEmailText(pending.name, otp)
    );

    if (!emailSent && env.NODE_ENV === "production") {
      throw new ApiError(500, "SMTP is not configured. Unable to send OTP email.");
    }

    res.json({
      message: "A new OTP has been sent to your email."
    });
  } catch (error) {
    next(error);
  }
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body as { email: string };
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!normalizedEmail) {
      throw new ApiError(400, "Email is required");
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_MS);

      await prisma.passwordReset.upsert({
        where: { email: normalizedEmail },
        update: { otp, expiresAt },
        create: { email: normalizedEmail, otp, expiresAt }
      });

      await sendOptionalEmail(
        normalizedEmail,
        "Password Reset Code",
        buildOtpEmailText(user.name, otp)
      );

      await writeAuditLog({
        actorId: user.id,
        actorRole: user.role,
        entityType: "Auth",
        entityId: user.id,
        action: "FORGOT_PASSWORD_OTP_SENT"
      });
    }

    res.json({
      message: "If an account with that email exists, a password reset code has been sent to your email."
    });
  } catch (error) {
    next(error);
  }
};

export const verifyResetOtp = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp } = req.body as { email: string; otp: string };
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedOtp = String(otp || "").trim();

    if (!normalizedEmail || !normalizedOtp) {
      throw new ApiError(400, "Email and OTP are required");
    }

    const record = await prisma.passwordReset.findUnique({ where: { email: normalizedEmail } });
    if (!record || record.otp !== normalizedOtp) {
      throw new ApiError(400, "Invalid OTP");
    }

    if (Date.now() > record.expiresAt.getTime()) {
      await prisma.passwordReset.delete({ where: { email: normalizedEmail } });
      throw new ApiError(400, "OTP expired. Please request a new code.");
    }

    res.json({
      message: "OTP verified successfully. You can now enter your new password."
    });
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, otp, newPassword } = req.body as { email: string; otp: string; newPassword: string };
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedOtp = String(otp || "").trim();

    if (!normalizedEmail || !normalizedOtp || !newPassword) {
      throw new ApiError(400, "Email, OTP and new password are required");
    }

    if (newPassword.length < 6) {
      throw new ApiError(400, "Password must be at least 6 characters long");
    }

    const record = await prisma.passwordReset.findUnique({ where: { email: normalizedEmail } });
    if (!record || record.otp !== normalizedOtp) {
      throw new ApiError(400, "Invalid OTP or session expired");
    }

    if (Date.now() > record.expiresAt.getTime()) {
      await prisma.passwordReset.delete({ where: { email: normalizedEmail } });
      throw new ApiError(400, "OTP expired. Please request a new code.");
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { email: normalizedEmail },
      data: { password: hashedPassword }
    });

    await prisma.passwordReset.delete({ where: { email: normalizedEmail } });

    res.json({
      message: "Password reset successfully. You can now login with your new password."
    });

    await writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      entityType: "Auth",
      entityId: user.id,
      action: "PASSWORD_RESET_SUCCESS"
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction) => {
  const t0 = Date.now();
  try {
    const { email, password, role } = req.body as {
      email: string;
      password: string;
      role: Role;
    };

    if (!email || !password || !role) {
      throw new ApiError(400, "Email, password and role are required");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const tDbStart = Date.now();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    const tDbMs = Date.now() - tDbStart;

    if (!user) {
      throw new ApiError(401, "Invalid credentials");
    }

    if (user.isActive === false) {
      throw new ApiError(403, "Account not approved by admin yet.");
    }

    const tBcryptStart = Date.now();
    const validPassword = await bcrypt.compare(password, user.password);
    const tBcryptMs = Date.now() - tBcryptStart;

    if (!validPassword || user.role !== role) {
      throw new ApiError(401, "Invalid credentials or role");
    }

    const tJwtStart = Date.now();
    const token = signToken({
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name
    });
    const tJwtMs = Date.now() - tJwtStart;

    const totalBackendMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[LOGIN TIMING] total=${totalBackendMs}ms db=${tDbMs}ms bcrypt=${tBcryptMs}ms jwt=${tJwtMs}ms`);

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

    void writeAuditLog({
      actorId: user.id,
      actorRole: user.role,
      entityType: "Auth",
      entityId: user.id,
      action: "LOGIN"
    });
  } catch (error) {
    next(error);
  }
};

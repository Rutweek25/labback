import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { roles } from "../types/domain";
import type { Role } from "../types/domain";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export const protect = (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null;

  if (!token) {
    return next(new ApiError(401, "Unauthorized"));
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as Express.User;
    req.user = {
      id: decoded.id,
      role: decoded.role,
      email: decoded.email,
      name: decoded.name
    };
    return next();
  } catch (_error) {
    return next(new ApiError(401, "Invalid token"));
  }
};

export const authorize = (...roles: Role[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ApiError(403, "Forbidden"));
    }
    return next();
  };
};

export const authorizeRole = (role: "LAB" | Role) => {
  const mappedRole: Role = role === "LAB" ? roles[1] : role;
  return authorize(mappedRole);
};

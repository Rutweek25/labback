import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";

export const notFound = (_req: Request, res: Response) => {
  res.status(404).json({ message: "Route not found" });
};

export const errorHandler = (
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) => {
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ message: error.message });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return res.status(400).json({ message: error.message });
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return res.status(503).json({
      message: "Database connection failed. Check DATABASE_URL and MongoDB credentials."
    });
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ message: "Invalid database query payload." });
  }

  // eslint-disable-next-line no-console
  console.error(error);

  return res.status(500).json({ message: "Internal server error" });
};

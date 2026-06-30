import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

type RateBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateBucket>();

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startedAt = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
  });

  next();
};

export const rateLimit = (options: { windowMs: number; max: number; keyPrefix: string }) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${options.keyPrefix}:${req.ip || req.headers["x-forwarded-for"] || "unknown"}`;
    const now = Date.now();
    const bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (bucket.count >= options.max) {
      return next(new ApiError(429, "Too many requests. Please try again later."));
    }

    bucket.count += 1;
    buckets.set(key, bucket);
    return next();
  };
};
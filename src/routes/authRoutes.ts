import { Router } from "express";
import { login, register, resendRegistrationOtp, verifyRegistrationOtp } from "../controllers/authController";
import { rateLimit } from "../middlewares/securityMiddleware";

const router = Router();

const authLimiter = rateLimit({ windowMs: 60_000, max: 8, keyPrefix: "auth" });

router.post("/register", authLimiter, register);
router.post("/verify-otp", authLimiter, verifyRegistrationOtp);
router.post("/resend-otp", authLimiter, resendRegistrationOtp);
router.post("/login", authLimiter, login);

export default router;

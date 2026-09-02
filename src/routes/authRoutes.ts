import { Router } from "express";
import { forgotPassword, login, register, resendRegistrationOtp, resetPassword, verifyRegistrationOtp, verifyResetOtp } from "../controllers/authController";
import { rateLimit } from "../middlewares/securityMiddleware";

const router = Router();

const authLimiter = rateLimit({ windowMs: 60_000, max: 8, keyPrefix: "auth" });

router.post("/register", authLimiter, register);
router.post("/verify-otp", authLimiter, verifyRegistrationOtp);
router.post("/resend-otp", authLimiter, resendRegistrationOtp);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/verify-reset-otp", authLimiter, verifyResetOtp);
router.post("/reset-password", authLimiter, resetPassword);
router.post("/login", authLimiter, login);

export default router;

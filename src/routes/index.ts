import { Router } from "express";
import authRoutes from "./authRoutes";
import patientRoutes from "./patientRoutes";
import testRoutes from "./testRoutes";
import orderRoutes from "./orderRoutes";
import paymentRoutes from "./paymentRoutes";
import reportRoutes from "./reportRoutes";
import adminRoutes from "./adminRoutes";
import notificationRoutes from "./notificationsRoutes";
import { protect, authorize } from "../middlewares/authMiddleware";
import { roles } from "../types/domain";
import { createOrderWithPatient } from "../controllers/orderController";
import { globalSearch } from "../controllers/searchController";

const router = Router();

router.use("/auth", authRoutes);
router.use("/patients", patientRoutes);
router.use("/tests", testRoutes);
router.use("/orders", orderRoutes);
router.get("/search/global", protect, authorize(roles[0], roles[1], roles[2]), globalSearch);
router.post("/patients-with-order", protect, authorize(roles[0]), createOrderWithPatient);
router.use("/payments", paymentRoutes);
router.use("/reports", reportRoutes);
router.use("/admin", adminRoutes);
router.use("/notifications", notificationRoutes);

export default router;

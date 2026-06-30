import { Router } from "express";
import { authorizeRole, protect } from "../middlewares/authMiddleware";
import {
	createTestByAdmin,
	createUserByAdmin,
	deleteTestByAdmin,
	deleteUserByAdmin,
	getAdminSummary,
	getSettings,
	listOrdersByAdmin,
	listPaymentsByAdmin,
	listReportsByAdmin,
	listTestsByAdmin,
	listUsers,
	toggleUserStatusByAdmin,
	updateSettings,
	updateTestByAdmin,
	updateUserByAdmin
} from "../controllers/adminController";
import { listAuditLogs } from "../controllers/auditController";

const router = Router();

router.use(protect, authorizeRole("ADMIN"));

router.get("/dashboard", getAdminSummary);
router.get("/users", listUsers);
router.post("/users", createUserByAdmin);
router.put("/users/:id", updateUserByAdmin);
router.patch("/users/:id/status", toggleUserStatusByAdmin);
router.delete("/users/:id", deleteUserByAdmin);

router.get("/tests", listTestsByAdmin);
router.post("/tests", createTestByAdmin);
router.put("/tests/:id", updateTestByAdmin);
router.delete("/tests/:id", deleteTestByAdmin);

router.get("/orders", listOrdersByAdmin);
router.get("/payments", listPaymentsByAdmin);
router.get("/reports", listReportsByAdmin);
router.get("/audit-logs", listAuditLogs);

router.get("/settings", getSettings);
router.put("/settings", updateSettings);

export default router;

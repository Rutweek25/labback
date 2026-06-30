import { Router } from "express";
import { roles } from "../types/domain";
import { downloadReport, listReports, updateReportStatus, uploadReport } from "../controllers/reportController";
import { authorize, authorizeRole, protect } from "../middlewares/authMiddleware";
import { upload } from "../utils/upload";

const router = Router();

router.use(protect);
router.get("/download/:id", downloadReport);
router.post("/", authorizeRole("LAB"), upload.single("report"), uploadReport);
router.post("/:orderId", authorize(roles[1], roles[2]), upload.single("report"), uploadReport);
router.get("/:orderId", listReports);
router.patch("/:id/status", authorizeRole("LAB"), updateReportStatus);

export default router;

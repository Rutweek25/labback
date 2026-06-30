import { Router } from "express";
import { roles } from "../types/domain";
import { getAnalytics } from "../controllers/dashboardController";
import { authorize, protect } from "../middlewares/authMiddleware";

const router = Router();

router.use(protect, authorize(roles[1], roles[2]));
router.get("/analytics", getAnalytics);

export default router;

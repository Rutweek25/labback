import { Router } from "express";
import { markAllNotificationsAsRead, markNotificationAsRead, listNotifications } from "../controllers/notificationController";
import { protect } from "../middlewares/authMiddleware";

const router = Router();

router.use(protect);
router.get("/", listNotifications);
router.patch("/read-all", markAllNotificationsAsRead);
router.patch("/:id/read", markNotificationAsRead);

export default router;
import { Router } from "express";
import { roles } from "../types/domain";
import {
  createPayment,
  generateInvoice,
  listPayments,
  paymentHistory,
  updatePaymentStatus
} from "../controllers/paymentController";
import { authorize, authorizeRole, protect } from "../middlewares/authMiddleware";

const router = Router();

router.use(protect);
router.get("/", authorize(roles[0], roles[1], roles[2]), listPayments);
router.post("/:orderId", authorize(roles[1], roles[2]), createPayment);
router.put("/:id", authorizeRole("LAB"), updatePaymentStatus);
router.get("/:orderId/history", paymentHistory);
router.get("/:orderId/invoice", generateInvoice);

export default router;

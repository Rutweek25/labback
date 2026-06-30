import { Router } from "express";
import { roles } from "../types/domain";
import {
	createOrder,
	createOrderForExistingPatient,
	createOrderWithPatient,
	deleteOrder,
	deleteOrderByLab,
	listOrders,
	updateOrderSampleStatusByLab,
	updateOrderStatusByLab,
	updateOrderTestsByLab,
	updateOrder
} from "../controllers/orderController";
import { authorize, authorizeRole, protect } from "../middlewares/authMiddleware";

const router = Router();

router.use(protect);
router.get("/", listOrders);
router.post("/", authorize(roles[0]), createOrder);
router.post("/create-with-patient", authorize(roles[0]), createOrderWithPatient);
router.post("/create-for-existing", authorize(roles[0]), createOrderForExistingPatient);
router.put("/:id/tests", authorizeRole("LAB"), updateOrderTestsByLab);
router.put("/:id/status", authorizeRole("LAB"), updateOrderStatusByLab);
router.put("/:id/sample-status", authorizeRole("LAB"), updateOrderSampleStatusByLab);
router.delete("/:id", authorize(roles[0], roles[1], roles[2]), deleteOrder);
router.put("/:id", authorize(roles[0], roles[1], roles[2]), updateOrder);
router.delete("/:id/legacy", authorize(roles[0], roles[1], roles[2]), deleteOrder);

export default router;

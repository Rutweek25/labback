import { Router } from "express";
import { roles } from "../types/domain";
import { createTest, deleteTest, listTests, updateTest } from "../controllers/testController";
import { authorize, protect } from "../middlewares/authMiddleware";

const router = Router();

router.use(protect);
router.get("/", listTests);
router.post("/", authorize(roles[1], roles[2]), createTest);
router.put("/:id", authorize(roles[1], roles[2]), updateTest);
router.delete("/:id", authorize(roles[1], roles[2]), deleteTest);

export default router;

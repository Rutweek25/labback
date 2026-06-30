import { Router } from "express";
import { roles } from "../types/domain";
import { createPatient, deletePatient, listPatients, updatePatient } from "../controllers/patientController";
import { authorize, protect } from "../middlewares/authMiddleware";

const router = Router();

router.use(protect);
router.get("/", listPatients);
router.post("/", authorize(roles[0]), createPatient);
router.put("/:id", authorize(roles[0]), updatePatient);
router.delete("/:id", authorize(roles[0]), deletePatient);

export default router;

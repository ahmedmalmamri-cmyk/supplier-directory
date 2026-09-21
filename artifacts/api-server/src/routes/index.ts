import { Router, type IRouter } from "express";
import healthRouter from "./health";
import directoryRouter from "./directory";
import adminRouter from "./admin";
import registrationsRouter from "./registrations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(directoryRouter);
router.use(adminRouter);
router.use(registrationsRouter);

export default router;

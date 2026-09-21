import { Router, type IRouter } from "express";
import healthRouter from "./health";
import directoryRouter from "./directory";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(directoryRouter);
router.use(adminRouter);

export default router;

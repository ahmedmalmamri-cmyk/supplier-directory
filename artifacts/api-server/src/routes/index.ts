import { Router, type IRouter } from "express";
import healthRouter from "./health";
import directoryRouter from "./directory";

const router: IRouter = Router();

router.use(healthRouter);
router.use(directoryRouter);

export default router;

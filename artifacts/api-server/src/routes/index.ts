import { Router, type IRouter } from "express";
import healthRouter from "./health";
import directoryRouter from "./directory";
import adminRouter from "./admin";
import registrationsRouter from "./registrations";
import buyerRouter from "./buyer";
import supplierRouter from "./supplier";
import buyerInvitationsRouter from "./buyer-invitations";
import itemCategoryGroupsRouter from "./item-category-groups";
import testModeRouter from "./test-mode";

const router: IRouter = Router();

router.use(healthRouter);
router.use(directoryRouter);
router.use(itemCategoryGroupsRouter);
router.use(testModeRouter);
router.use(adminRouter);
router.use(registrationsRouter);
router.use(buyerRouter);
router.use(buyerInvitationsRouter);
router.use(supplierRouter);

export default router;

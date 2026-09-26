import { Router, type IRouter, type Response } from "express";
import { getBuyerIdFromRequest, setBuyerSession, clearBuyerSession } from "../lib/buyer-auth";
import { getSupplierIdFromRequest, setSupplierSession, clearSupplierSession } from "../lib/supplier-auth";
import { requireAdmin } from "../lib/admin-auth";
import {
  buildTestModeReport,
  clearTestModeSession,
  ensureTestModeAccounts,
  getTestModeSession,
  isTestModeAccount,
  isTestModeRequest,
  listTestModeAccounts,
  setTestModeSession,
  type TestModeRole,
} from "../lib/test-mode";

const router: IRouter = Router();

function setupError(error: unknown, res: Response) {
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("TEST_MODE_ACCOUNT_CONFLICT:")) {
    const [, role, phone] = message.split(":");
    res.status(409).json({ error: `تعذر تجهيز حساب ${role === "supplier" ? "المورد" : "صاحب العمل"} التجريبي: الرقم ${phone} مستخدم لحساب آخر. لم يتم تعديل الحساب الموجود.` });
    return;
  }
  res.status(500).json({ error: message || "تعذر تجهيز حسابات المعاينة." });
}

router.get("/test-mode/status", (req, res): void => {
  const session = getTestModeSession(req);
  const authenticatedId = session?.role === "buyer"
    ? getBuyerIdFromRequest(req)
    : session?.role === "supplier" ? getSupplierIdFromRequest(req) : null;
  if (!session || authenticatedId !== session.id || !isTestModeRequest(req, session.role, session.id)) {
    res.json({ active: false });
    return;
  }
  res.json({ active: true, role: session.role });
});

router.get("/admin/test-mode", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  try {
    ensureTestModeAccounts();
    res.json({ accounts: listTestModeAccounts(), report: buildTestModeReport() });
  } catch (error) {
    setupError(error, res);
  }
});

router.get("/admin/test-mode/report", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  try {
    ensureTestModeAccounts();
    res.json(buildTestModeReport());
  } catch (error) {
    setupError(error, res);
  }
});

router.post("/admin/test-mode/start", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const role = req.body?.role;
  if (role !== "supplier" && role !== "buyer") {
    res.status(400).json({ error: "اختر دوراً صالحاً للمعاينة." });
    return;
  }
  try {
    const accounts = ensureTestModeAccounts();
    const account = accounts.find((item) => item.role === role && item.ready);
    if (!account) {
      res.status(409).json({ error: "حساب المعاينة غير جاهز." });
      return;
    }
    clearBuyerSession(res);
    clearSupplierSession(res);
    if (role === "buyer") setBuyerSession(res, account.id);
    else setSupplierSession(res, account.id);
    setTestModeSession(res, role as TestModeRole, account.id);
    res.json({
      success: true,
      role,
      redirectPath: account.route,
    });
  } catch (error) {
    setupError(error, res);
  }
});

router.post("/admin/test-mode/exit", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const session = getTestModeSession(req);
  const supplierId = getSupplierIdFromRequest(req);
  const buyerId = getBuyerIdFromRequest(req);
  if ((session?.role === "supplier" && supplierId === session.id) ||
      (supplierId && isTestModeAccount("supplier", supplierId))) clearSupplierSession(res);
  if ((session?.role === "buyer" && buyerId === session.id) ||
      (buyerId && isTestModeAccount("buyer", buyerId))) clearBuyerSession(res);
  clearTestModeSession(res);
  res.json({ success: true });
});

export default router;
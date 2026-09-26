import { Router, type IRouter, type Response } from "express";
import { getBuyerIdFromRequest } from "../lib/buyer-auth";
import { getSupplierIdFromRequest } from "../lib/supplier-auth";
import { requireAdmin } from "../lib/admin-auth";
import { directoryDb } from "../lib/directory-db";
import {
  buildTestModeReport,
  clearTestModeSession,
  ensureTestModeAccounts,
  getTestModeSession,
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
  res.json({
    active: true,
    role: session.role,
    accountType: session.role === "supplier" ? "test" : "existing",
  });
});

router.get("/admin/test-mode", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  try {
    ensureTestModeAccounts();
    const buyerId = getBuyerIdFromRequest(req);
    const buyer = buyerId
      ? directoryDb.prepare("SELECT full_name AS name FROM buyer_users WHERE id = ? AND moderation_status != 'blocked'")
        .get(buyerId) as { name: string } | undefined
      : undefined;
    res.json({
      accounts: listTestModeAccounts(),
      buyerPreview: {
        available: Boolean(buyer),
        name: buyer?.name ?? null,
        route: buyer ? "/buyer/profile" : "/buyer/login",
      },
      report: buildTestModeReport(),
    });
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
    const buyerId = getBuyerIdFromRequest(req);

    let account: { id: number; route: string } | undefined;
    if (role === "supplier") {
      const supplierAccount = accounts.find((item) => item.ready);
      if (supplierAccount) account = { id: supplierAccount.id, route: supplierAccount.route };
    } else if (buyerId) {
      const buyer = directoryDb.prepare("SELECT id FROM buyer_users WHERE id = ? AND moderation_status != 'blocked'")
        .get(buyerId) as { id: number } | undefined;
      if (buyer) account = { id: buyer.id, route: "/buyer/profile" };
    }
    if (!account) {
      res.status(409).json({
        error: role === "buyer"
          ? "سجّل الدخول إلى حساب صاحب العمل الموجود لديك في هذا المتصفح أولاً."
          : "حساب المورد التجريبي غير جاهز.",
      });
      return;
    }
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
  clearTestModeSession(res);
  res.json({ success: true });
});

export default router;
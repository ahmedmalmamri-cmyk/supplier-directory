import { Router, type IRouter, type Response } from "express";
import { getBuyerIdFromRequest } from "../lib/buyer-auth";
import { getSupplierIdFromRequest } from "../lib/supplier-auth";
import { requireAdmin } from "../lib/admin-auth";
import { directoryDb } from "../lib/directory-db";
import {
  buildTestModeReport,
  clearTestModeSession,
  getTestModeSession,
  isTestModeRequest,
  setTestModeSession,
} from "../lib/test-mode";

const router: IRouter = Router();

function setupError(error: unknown, res: Response) {
  const message = error instanceof Error ? error.message : "";
  res.status(500).json({ error: message || "تعذر تحميل بيانات المعاينة." });
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
    const buyerId = getBuyerIdFromRequest(req);
    const buyer = buyerId
      ? directoryDb.prepare("SELECT full_name AS name FROM buyer_users WHERE id = ? AND moderation_status != 'blocked'")
        .get(buyerId) as { name: string } | undefined
      : undefined;
    res.json({
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
    res.json(buildTestModeReport());
  } catch (error) {
    setupError(error, res);
  }
});

router.post("/admin/test-mode/start", (req, res): void => {
  if (!requireAdmin(req, res)) return;
  const role = req.body?.role;
  if (role !== "buyer") {
    res.status(400).json({ error: role === "supplier"
      ? "أُلغي حساب المورد التجريبي. استخدم حساب مورد حقيقي بعد اعتماده وتفعيله."
      : "اختر دوراً صالحاً للمعاينة." });
    return;
  }
  try {
    const buyerId = getBuyerIdFromRequest(req);
    const buyer = buyerId ? directoryDb.prepare("SELECT id FROM buyer_users WHERE id = ? AND moderation_status != 'blocked'")
      .get(buyerId) as { id: number } | undefined : undefined;
    if (!buyer) {
      res.status(409).json({ error: "سجّل الدخول إلى حساب صاحب العمل الموجود لديك في هذا المتصفح أولاً." });
      return;
    }
    setTestModeSession(res, "buyer", buyer.id);
    res.json({
      success: true,
      role: "buyer",
      redirectPath: "/buyer/profile",
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
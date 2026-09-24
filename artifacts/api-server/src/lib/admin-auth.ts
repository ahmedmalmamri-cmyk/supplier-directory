import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const adminCookieName = "bakery_admin_session";

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

export function isAdminAuthenticated(req: Request) {
  const token = req.cookies?.[adminCookieName];
  if (typeof token !== "string") return false;
  const [role, tokenBody] = token.split(":");
  const [expiresAtText, signature] = tokenBody?.split(".") ?? [];
  if (role !== "admin" || !expiresAtText || !signature) return false;
  const expiresAt = Number(expiresAtText);
  if (!Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;

  const expected = createHmac("sha256", getSessionSecret())
    .update(`admin:${expiresAt}`)
    .digest("hex");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);
}

export function requireAdmin(req: Request, res: Response) {
  if (isAdminAuthenticated(req)) return true;
  res.status(401).json({ error: "تسجيل دخول المدير مطلوب" });
  return false;
}
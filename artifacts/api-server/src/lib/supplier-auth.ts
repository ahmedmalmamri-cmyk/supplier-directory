import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

const supplierCookieName = "bakery_supplier_session";
const sessionDurationSeconds = 60 * 60 * 12;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function createSessionToken(supplierId: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionDurationSeconds;
  const payload = `supplier:${supplierId}:${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function setSupplierSession(res: Response, supplierId: number) {
  res.cookie(supplierCookieName, createSessionToken(supplierId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionDurationSeconds * 1000,
    path: "/",
  });
}

export function clearSupplierSession(res: Response) {
  res.clearCookie(supplierCookieName, { httpOnly: true, sameSite: "lax", path: "/" });
}

export function getSupplierIdFromRequest(req: Request) {
  const token = req.cookies?.[supplierCookieName];
  if (!token) return null;
  const [payload, signature] = token.split(/(?=\.[^.]+$)/);
  if (!payload || !signature?.startsWith(".")) return null;
  const [role, supplierIdText, expiresAtText] = payload.split(":");
  const supplierId = Number(supplierIdText);
  const expiresAt = Number(expiresAtText);
  if (role !== "supplier" || !Number.isInteger(supplierId) || supplierId <= 0 ||
      !Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  const providedBuffer = Buffer.from(signature.slice(1));
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  return supplierId;
}

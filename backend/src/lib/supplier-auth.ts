import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionCookieOptions } from "./deployment-config";
import type { Request, Response } from "express";
import { getTestModeSession } from "./test-mode";

const supplierCookieName = "bakery_supplier_session";
const sessionDurationSeconds = 60 * 60 * 12;
const rememberDurationSeconds = 60 * 60 * 24 * 30;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function createSessionToken(supplierId: number, remember: boolean) {
  const expiresAt = Math.floor(Date.now() / 1000) + (remember ? rememberDurationSeconds : sessionDurationSeconds);
  const payload = `supplier:${supplierId}:${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
  return `${payload}.${signature}`;
}

export function setSupplierSession(res: Response, supplierId: number, remember = false) {
  const cookieOptions = sessionCookieOptions();
  res.cookie(supplierCookieName, createSessionToken(supplierId, remember), remember
    ? { ...cookieOptions, maxAge: rememberDurationSeconds * 1000 }
    : cookieOptions);
}

export function clearSupplierSession(res: Response) {
  res.clearCookie(supplierCookieName, sessionCookieOptions());
}

export function getSupplierIdFromRequest(req: Request) {
  const testModeSession = getTestModeSession(req);
  if (testModeSession?.role === "supplier") return testModeSession.id;
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

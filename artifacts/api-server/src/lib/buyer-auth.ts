import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const buyerCookieName = "bakery_buyer_session";
const sessionDurationSeconds = 60 * 60 * 24 * 30;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("hex");
}

export function createBuyerSessionToken(buyerId: number) {
  const expiresAt = Math.floor(Date.now() / 1000) + sessionDurationSeconds;
  const payload = `${buyerId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function getBuyerIdFromRequest(req: Request) {
  const token = req.cookies?.[buyerCookieName];
  if (typeof token !== "string") return null;
  const [buyerIdText, expiresAtText, signature] = token.split(".");
  const buyerId = Number(buyerIdText);
  const expiresAt = Number(expiresAtText);
  if (!Number.isInteger(buyerId) || buyerId <= 0 || !Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000) || !signature) {
    return null;
  }
  const expected = sign(`${buyerId}.${expiresAt}`);
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  return buyerId;
}

export function setBuyerSession(res: Response, buyerId: number) {
  res.cookie(buyerCookieName, createBuyerSessionToken(buyerId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: sessionDurationSeconds * 1000,
    path: "/",
  });
}

export function clearBuyerSession(res: Response) {
  res.clearCookie(buyerCookieName, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
}
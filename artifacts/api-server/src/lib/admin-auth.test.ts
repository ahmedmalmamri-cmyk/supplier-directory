import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { Request } from "express";
import { authenticatedAdminId, isAdminAuthenticated } from "./admin-auth";

function requestWithToken(token?: string) {
  return { cookies: token ? { bakery_admin_session: token } : {} } as unknown as Request;
}

function signedToken(secret: string, role = "admin", expiresAt = Math.floor(Date.now() / 1000) + 60) {
  const signature = createHmac("sha256", secret).update(`admin:${expiresAt}`).digest("hex");
  return `${role}:${expiresAt}.${signature}`;
}

test("authenticated admin sessions resolve to the singleton admin identity", () => {
  const previousSecret = process.env.SESSION_SECRET;
  const secret = "test-session-secret";
  process.env.SESSION_SECRET = secret;
  try {
    const validRequest = requestWithToken(signedToken(secret));
    assert.equal(isAdminAuthenticated(validRequest), true);
    assert.equal(authenticatedAdminId(validRequest), 1);
    assert.equal(isAdminAuthenticated(requestWithToken()), false);
    assert.equal(authenticatedAdminId(requestWithToken()), null);
    assert.equal(isAdminAuthenticated(requestWithToken(signedToken(secret, "buyer"))), false);
    assert.equal(isAdminAuthenticated(requestWithToken(signedToken(secret, "admin", 1))), false);
  } finally {
    if (previousSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSecret;
  }
});

test("a missing session secret is surfaced for a structurally valid admin token", () => {
  const previousSecret = process.env.SESSION_SECRET;
  delete process.env.SESSION_SECRET;
  try {
    const request = requestWithToken("admin:9999999999.invalid");
    assert.throws(() => isAdminAuthenticated(request), /SESSION_SECRET is not configured/);
  } finally {
    if (previousSecret !== undefined) process.env.SESSION_SECRET = previousSecret;
  }
});
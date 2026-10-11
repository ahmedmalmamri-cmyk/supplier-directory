import test from "node:test";
import assert from "node:assert/strict";
import { allowedFrontendOrigins, sessionCookieOptions } from "./deployment-config";

test("production session cookies work across HTTPS origins and stay HttpOnly", () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.deepEqual(sessionCookieOptions(), { httpOnly: true, sameSite: "none", secure: true, path: "/" });
  } finally { process.env.NODE_ENV = saved; }
});

test("development session cookies work on plain localhost", () => {
  const saved = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.equal(sessionCookieOptions().sameSite, "lax");
    assert.equal(sessionCookieOptions().secure, false);
  } finally { process.env.NODE_ENV = saved; }
});

test("production requires exact frontend origins and rejects wildcard/path configuration", () => {
  const savedNode = process.env.NODE_ENV;
  const savedOrigin = process.env.FRONTEND_URL;
  process.env.NODE_ENV = "production";
  try {
    delete process.env.FRONTEND_URL;
    assert.throws(() => allowedFrontendOrigins(), /required/);
    process.env.FRONTEND_URL = "https://site.example.test/, https://preview.example.test";
    assert.deepEqual(allowedFrontendOrigins(), ["https://site.example.test", "https://preview.example.test"]);
    process.env.FRONTEND_URL = "*";
    assert.throws(() => allowedFrontendOrigins(), /exact/);
    process.env.FRONTEND_URL = "https://site.example.test/admin";
    assert.throws(() => allowedFrontendOrigins(), /exact/);
  } finally {
    if (savedNode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedNode;
    if (savedOrigin === undefined) delete process.env.FRONTEND_URL; else process.env.FRONTEND_URL = savedOrigin;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const source = await readFile(new URL("../src/lib/api-origin.ts", import.meta.url), "utf8");
const compiled = await transform(source, {
  loader: "ts", format: "esm",
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("https://api.example.test/") },
});
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString("base64")}`);

test("API paths and upload paths resolve to Railway; other absolute URLs are untouched", () => {
  assert.equal(api.apiUrl("/api/groups"), "https://api.example.test/api/groups");
  assert.equal(api.apiUrl("/uploads/document.jpg"), "https://api.example.test/api/uploads/document.jpg");
  assert.equal(api.apiUrl("https://storage.googleapis.com/signed-upload"), "https://storage.googleapis.com/signed-upload");
});

test("API requests include sessions, but a third-party signed upload never receives cookies", async () => {
  const previousFetch = globalThis.fetch;
  const previousWindow = globalThis.window;
  const calls = [];
  globalThis.window = { location: { origin: "https://site.example.test" } };
  globalThis.fetch = async (input, options) => {
    calls.push({ input, options });
    return new Response(JSON.stringify({ document: "/uploads/doc.jpg", photo: "/api/item-inquiries/3/photo" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  };
  try {
    const response = await api.apiFetch("/api/buyer/me", { credentials: "same-origin" });
    assert.equal(calls[0].options.credentials, "include");
    assert.equal(calls[0].input, "https://api.example.test/api/buyer/me");
    const data = await response.json();
    assert.equal(data.document, "https://api.example.test/api/uploads/doc.jpg");
    assert.equal(data.photo, "https://api.example.test/api/item-inquiries/3/photo");
    await api.apiFetch("https://storage.googleapis.com/signed-upload", { method: "PUT", credentials: "include" });
    assert.equal(calls[1].options.credentials, "omit");
  } finally {
    globalThis.fetch = previousFetch;
    globalThis.window = previousWindow;
  }
});

test("Nested resource URLs are rebased, while invitation paths and text remain unchanged", () => {
  assert.deepEqual(api.normalizeApiData({ items: [{ image: "/uploads/image.png" }], route: "/invite/buyer/test", name: "Supplier" }), {
    items: [{ image: "https://api.example.test/api/uploads/image.png" }],
    route: "/invite/buyer/test", name: "Supplier",
  });
});

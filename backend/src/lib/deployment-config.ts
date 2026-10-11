import path from "node:path";

export const uploadsDirectory = path.resolve(process.env.UPLOADS_DIR || "uploads");

export function sessionCookieOptions() {
  const production = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: production ? "none" as const : "lax" as const,
    secure: production,
    path: "/",
  };
}

export function allowedFrontendOrigins() {
  const configured = process.env.FRONTEND_URL?.split(",").map((value) => value.trim().replace(/\/+$/, "")).filter(Boolean);
  if (configured?.length) {
    for (const origin of configured) {
      if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error("FRONTEND_URL must contain exact HTTP(S) origins.");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") throw new Error("FRONTEND_URL is required in production.");
  return ["http://localhost:5173", "http://127.0.0.1:5173"];
}

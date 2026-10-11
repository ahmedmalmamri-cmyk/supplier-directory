import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { durableDirectoryMiddleware } from "./lib/directory-persistence";
import { allowedFrontendOrigins, uploadsDirectory } from "./lib/deployment-config";

const app: Express = express();
app.set("trust proxy", 1);
const permittedOrigins = allowedFrontendOrigins();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({
  origin(origin, done) {
    done(null, !origin || permittedOrigins.includes(origin));
  },
  credentials: true,
}));
// SameSite=None is necessary across Vercel/Railway. Reject cross-origin writes
// rather than relying on CORS, which by itself does not prevent CSRF.
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && !permittedOrigins.includes(origin) && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    res.status(403).json({ error: "Request origin is not permitted." });
    return;
  }
  next();
});
app.use(cookieParser());
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadsDirectory));
app.use("/api/uploads", express.static(uploadsDirectory));

app.use("/api", durableDirectoryMiddleware, router);

export default app;

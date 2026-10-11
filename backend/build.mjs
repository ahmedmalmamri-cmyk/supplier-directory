import { build } from "esbuild";
import { rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  packages: "external",
  platform: "node",
  target: "node22",
  format: "esm",
  logLevel: "info",
});

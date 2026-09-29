---
name: API integration test execution
description: Node TypeScript test loader limitation in this workspace.
---

Use the project's bundled CommonJS test script for API integration tests that import the Express app, rather than running raw Node's TypeScript test mode.

**Why:** Node can strip TypeScript syntax here but cannot resolve the app's extensionless ESM directory and generated-library imports. Bundling as ESM also fails on CommonJS dependencies with dynamic require; the CommonJS bundle runs the real app against an isolated temporary SQLite database.

**How to apply:** Prefer an existing package test script that bundles the integration entrypoint and runs it. Do not treat a module-resolution error from raw `node --test` as an application failure.
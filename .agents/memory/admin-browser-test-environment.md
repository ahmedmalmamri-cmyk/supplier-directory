---
name: Admin browser test environment
description: Environment boundary encountered when verifying password-protected admin screens.
---

Browser testing subagents may not have access to environment secrets that are available to the application's server-side shell. Do not assume an automated browser can retrieve a configured admin password, and never pass its value or a session cookie through an agent report.

**Why:** An authenticated UI test could not run in the browser tester because its runtime did not expose the configured secret, even though server-side tools could use it without revealing it.

**How to apply:** For future authenticated admin checks, use server-side automation that references the configured secret internally and only reports non-sensitive pass/fail results. Keep credentials and session contents out of screenshots, logs, and memory.
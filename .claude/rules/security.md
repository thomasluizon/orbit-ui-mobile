---
globs: ["apps/web/app/api/**", "apps/web/middleware.ts", "apps/web/app/actions/**"]
description: Security rules -- open redirect prevention, BFF allowlist, cookies, source maps
---

# Security

- **Open redirect prevention:** All `returnUrl` params must start with `/` and not `//`. Applied in login page, auth-callback, and middleware.
- **BFF path allowlist:** The catch-all proxy only forwards requests matching allowed prefixes. Add new API routes to the allowlist in `app/api/[...path]/route.ts`.
- **Source maps:** Disabled in production.
- **Cookie security:** Auth cookie uses `sameSite: 'strict'` and `secure: true` always (not just in prod).
- **Server Actions:** Always validate auth via `getAuthHeaders()`. Never trust client-provided tokens.

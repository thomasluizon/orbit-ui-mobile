<!-- Context: project-intelligence/bridge | Priority: high | Version: 1.0 | Updated: 2026-04-24 -->

# Business Tech Bridge

> These mappings explain why Orbit's technical rules exist. Use them to avoid locally correct but product-wrong changes.

## Core Mapping

| Product Need | Technical Solution | Why It Matters |
|--------------|-------------------|----------------|
| Same experience on web and mobile | Mandatory cross-platform parity | Prevents users from seeing different features or behavior per device |
| Secure web auth | httpOnly strict secure cookies and BFF proxy | Keeps JWT out of browser JavaScript and centralizes API access |
| Secure mobile auth | SecureStore JWT storage | Fits native mobile constraints without cookies |
| Reliable daily habits | Parse `YYYY-MM-DD` as local date | Avoids UTC date drift and wrong habit completion days |
| Predictable backend contracts | Shared Zod types, endpoints, query keys | Reduces duplicated logic and platform drift |
| Localized product | Shared `en` and `pt-BR` locale files | Keeps user-facing copy consistent across platforms |
| Offline resilience | IndexedDB on web and SQLite on mobile | Lets users continue tracking through connectivity issues |

## Feature Implementation Rule

When implementing a product feature:

1. Check shared contracts first.
2. Implement web behavior.
3. Implement equivalent mobile behavior.
4. Add or update shared i18n keys.
5. Run targeted validation.

## Common Risk Patterns

| Risk | Why It Is Bad | Correct Approach |
|------|---------------|------------------|
| Web-only feature | Breaks product parity | Add mobile equivalent in same task |
| Hardcoded display text | Breaks localization | Add keys to shared locale files |
| Inline query keys | Causes cache drift | Use shared query key factories |
| Frontend due-date calculation | Conflicts with backend schedule ownership | Ask API for schedule-derived data |
| Direct web API calls | Bypasses BFF auth boundary | Use route handlers or Server Actions |

## Related Files

- `technical-domain.md`
- `business-domain.md`
- `decisions-log.md`

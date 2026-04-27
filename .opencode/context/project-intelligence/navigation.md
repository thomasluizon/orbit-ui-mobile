<!-- Context: project-intelligence/nav | Priority: critical | Version: 1.0 | Updated: 2026-04-24 -->

# Orbit Project Intelligence

> Start here when using OpenCode in Orbit. Project-local `AGENTS.md` remains authoritative; these files summarize the same rules in the project context system.

## Structure

```text
.opencode/context/project-intelligence/
├── navigation.md
├── business-domain.md
├── technical-domain.md
├── business-tech-bridge.md
├── decisions-log.md
└── living-notes.md
```

## Quick Routes

| Need | File | Use When |
|------|------|----------|
| Product purpose | `business-domain.md` | Understanding what Orbit is for |
| Stack and architecture | `technical-domain.md` | Planning code changes |
| Why technical choices matter | `business-tech-bridge.md` | Connecting features to product goals |
| Hard decisions | `decisions-log.md` | Checking non-negotiable constraints |
| Current gotchas | `living-notes.md` | Avoiding common mistakes |

## Mandatory Source Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Authoritative repository instructions |
| `apps/web/app/globals.css` | Web design tokens |
| `packages/shared/src/types/*.ts` | Shared Zod types |
| `packages/shared/src/api/endpoints.ts` | API endpoint constants |
| `packages/shared/src/query/keys.ts` | TanStack Query key factories |
| `packages/shared/src/i18n/en.json` | English locale strings |
| `packages/shared/src/i18n/pt-BR.json` | Brazilian Portuguese locale strings |

## Usage Notes

- Always preserve web/mobile parity.
- Always load `AGENTS.md` before implementing.
- For frontend UI work, also follow existing design tokens and project visual language.

## Related Files

- `business-domain.md`
- `technical-domain.md`
- `business-tech-bridge.md`
- `decisions-log.md`
- `living-notes.md`

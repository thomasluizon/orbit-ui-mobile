<!-- Context: project-intelligence/notes | Priority: medium | Version: 1.0 | Updated: 2026-04-24 -->

# Orbit Living Notes

> Active gotchas and operational notes for AI-assisted work in this repo.

## Current Gotchas

| Gotcha | Impact | Correct Response |
|--------|--------|------------------|
| API code is outside this repo | Frontend may depend on unavailable backend behavior | Do not invent backend fields or endpoints |
| Web/mobile parity is easy to miss | Incomplete features | Always check both apps before done |
| Locale keys are shared | Hardcoded copy creates drift | Add or update shared locale files |
| Local dates are sensitive | UTC parsing can shift habit days | Parse `YYYY-MM-DD` as local |
| Production secrets must stay out of files | Security risk | Use env vars and MCP auth stores |

## Code Patterns Worth Preserving

- Server Actions for web mutations.
- BFF proxy allowlist for web reads.
- TanStack Query for server data.
- Zustand only for ephemeral client state.
- Zod schemas for validation.
- Shared query key factories.

## Agent Workflow Notes

- Use `OpenCoder` for multi-file implementation.
- Use `ContextScout` before significant changes.
- Use `ExternalScout` when current package docs matter.
- Prefer minimal changes over broad rewrites.
- Never revert unrelated user changes.

## Open Questions

| Question | Status |
|----------|--------|
| Which OAC context files should be committed long-term? | Open |
| Whether `OpenAgent` should become the default OpenCode agent | Open |
| Whether SonarQube MCP should remain enabled in every session | Open |

## Related Files

- `technical-domain.md`
- `decisions-log.md`
- `AGENTS.md`

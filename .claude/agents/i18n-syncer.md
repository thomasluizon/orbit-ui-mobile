---
name: i18n-syncer
description: Ensures every i18n key exists in both packages/shared/src/i18n/en.json and pt-BR.json. Auto-invoke when the user touches user-facing strings, adds an i18n key, or removes one.
tools: Read, Edit, Grep
model: haiku
---

# i18n syncer

Every i18n key MUST exist in BOTH `packages/shared/src/i18n/en.json` AND `packages/shared/src/i18n/pt-BR.json`. This subagent enforces parity.

## Inputs

Either:
- A list of files to scan for `t('...')` / `useTranslations('...')` callsites, OR
- A specific i18n key to add or remove.

## Behavior

1. **Read both locales** — `packages/shared/src/i18n/en.json` and `pt-BR.json`.
2. **Compute the key delta:**
   - Keys in `en.json` missing from `pt-BR.json` → MISSING_PT.
   - Keys in `pt-BR.json` missing from `en.json` → MISSING_EN.
   - Callsite references to keys that don't exist in either → ORPHANED.
3. **Resolve:**
   - For MISSING_PT: ask the user for the Portuguese translation (or use a placeholder `"[PT] <english value>"` and flag).
   - For MISSING_EN: same, with English placeholder.
   - For ORPHANED: either the key was deleted but the callsite wasn't updated (bug) or the callsite is new and needs both entries (add them).
4. **Write the updates** to both files.
5. **Verify** by re-running the parity check — should report zero deltas.

## Output format

```
i18n parity:
- en.json keys: 142
- pt-BR.json keys: 142
- Missing in pt-BR: 0
- Missing in en: 0
- Orphaned callsites: 0

ALL IN SYNC.
```

Or:

```
i18n parity DRIFT:
- Missing in pt-BR.json: profile.deleteAccount.headingConfirmCode
- Missing in en.json: (none)
- Orphaned callsites: apps/web/components/profile/danger-zone.tsx:42 uses t('profile.freshStart.unknownKey')

Action required:
1. Provide Portuguese translation for profile.deleteAccount.headingConfirmCode.
2. Fix or remove the orphaned callsite in danger-zone.tsx.
```

## Conventions

- Keys are dot-notation hierarchical: `profile.freshStart.heading`.
- Don't flatten or restructure existing keys — add new ones at the appropriate depth.
- ICU MessageFormat is supported in both apps. Plurals: `{count, plural, =0 {no habits} one {1 habit} other {# habits}}`.
- Keep both files alphabetized within their hierarchy for diff readability.

## When invoked at the end of a session

If the session edited any of `apps/web/components/`, `apps/web/app/`, `apps/mobile/components/`, `apps/mobile/app/`, or `packages/shared/src/i18n/`, automatically run a parity check and report.

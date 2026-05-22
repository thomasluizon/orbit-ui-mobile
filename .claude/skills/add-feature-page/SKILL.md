---
name: add-feature-page
description: Scaffolds a parallel feature page across web and mobile with i18n stubs. Use when the user asks to add a new page, screen, or surface. Creates apps/web/app/(app)/X/page.tsx, apps/mobile/app/X.tsx, registers it in _layout.tsx, and stubs i18n keys in both locales.
---

# Add a feature page

Scaffolds a new top-level surface in both apps with i18n parity. Cross-platform parity is mandatory per root `CLAUDE.md` — both files land in one pass.

## Inputs

- **Page name** (kebab-case, e.g. `streak-history`, `goals-detail`).
- **Title** (i18n key value, English + Portuguese).
- **Where it lives in nav** — bottom tab, drawer, or deep link only.

## Steps

1. **Web page** — `apps/web/app/(app)/<page-name>/page.tsx`. Server Component by default. Title via `useTranslations` (next-intl).
2. **Mobile screen** — `apps/mobile/app/<page-name>.tsx`. Expo Router file-based route. Title via `useTranslation` (react-i18next).
3. **Register in mobile nav** if it's a bottom tab — `apps/mobile/app/(tabs)/_layout.tsx`. For deep-link-only pages, no registration needed.
4. **Register in web nav** if it should appear in the side/bottom navigation — `apps/web/components/navigation/web-nav.tsx`.
5. **i18n keys** — add the page's display strings to BOTH `packages/shared/src/i18n/en.json` AND `packages/shared/src/i18n/pt-BR.json` in the same diff. The `i18n-syncer` subagent will catch drift.
6. **Verify**: `npm run type-check` in `apps/web` and `apps/mobile`.

## Skeleton — web

```tsx
// apps/web/app/(app)/<page-name>/page.tsx
import { useTranslations } from "next-intl"
import { AppBar } from "@/components/ui/app-bar"

export default function PageName() {
  const t = useTranslations("<pageName>")
  return (
    <main>
      <AppBar title={t("title")} />
      {/* content */}
    </main>
  )
}
```

## Skeleton — mobile

```tsx
// apps/mobile/app/<page-name>.tsx
import { useTranslation } from "react-i18next"
import { AppBar } from "@/components/ui/app-bar"
import { View } from "react-native"

export default function PageName() {
  const { t } = useTranslation()
  return (
    <View>
      <AppBar title={t("<pageName>.title")} />
      {/* content */}
    </View>
  )
}
```

## Skip

- DO NOT pick the visual design here. That's for the user — or a follow-up `/impeccable shape` invocation.
- DO NOT create a Server Action or data hook — that's `add-api-endpoint` territory.

## Output

| File | Action |
|---|---|
| `apps/web/app/(app)/<page-name>/page.tsx` | CREATE |
| `apps/mobile/app/<page-name>.tsx` | CREATE |
| `apps/mobile/app/(tabs)/_layout.tsx` | UPDATE (if tab) |
| `apps/web/components/navigation/web-nav.tsx` | UPDATE (if nav) |
| `packages/shared/src/i18n/en.json` | UPDATE |
| `packages/shared/src/i18n/pt-BR.json` | UPDATE |

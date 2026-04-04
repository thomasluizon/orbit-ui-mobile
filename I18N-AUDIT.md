# i18n Audit Report

**Scope:** `apps/web` (Next.js 15 + next-intl) with locale files at `packages/shared/src/i18n/`

---

## 1. Key Parity

**Before fixes:** en.json and pt-BR.json were in full parity (0 differences).

**Keys added during this audit (both locales):**

| Key | en value | pt-BR value |
|-----|----------|-------------|
| `common.unknown` | `"Unknown"` | `"Desconhecido"` |
| `orbitMcp.apiKeysError` | `"Failed to load API keys"` | `"Falha ao carregar chaves de API"` |

**After fixes:** 0 keys missing in either direction.

---

## 2. Hardcoded Strings Found and Fixed

### `apps/web/components/chat/typing-indicator.tsx` - line 14
**Issue:** "Orbit" hardcoded as the AI sender label instead of using the i18n key.

**Before:**
```tsx
<span className="text-[11px] font-medium text-text-secondary mb-1 px-2 block">
  Orbit
</span>
```
**Fix:** Added `useTranslations` import and replaced with `{t('chat.senderOrbit')}`. The `message-bubble.tsx` already used this key correctly; the typing indicator did not.

---

### `apps/web/app/(app)/preferences/page.tsx` - line 226
**Issue:** Color scheme picker buttons used `aria-label={option.value}` (raw internal values like `"purple"`, `"blue"`) instead of translated labels.

**Before:**
```tsx
aria-label={option.value}
```
**Fix:**
```tsx
aria-label={t(`preferences.color${option.value.charAt(0).toUpperCase() + option.value.slice(1)}` as Parameters<typeof t>[0])}
```
This uses the existing `preferences.colorPurple`, `preferences.colorBlue`, etc. keys.

---

### `apps/web/components/onboarding/onboarding-welcome.tsx` - line 110
**Issue:** Same `aria-label={option.value}` pattern as preferences page, on the onboarding color scheme selector.

**Fix:** Same pattern as above - uses translated `preferences.color*` keys.

---

### `apps/web/app/(app)/about/page.tsx` - line 25-30
**Issue:** Back link to `/profile` had no `aria-label`, making it inaccessible to screen readers.

**Fix:** Added `aria-label={t('common.backToProfile')}` to match the pattern already used on all other profile sub-pages.

---

### `apps/web/app/(app)/achievements/page.tsx` - line 25
**Issue:** Same missing `aria-label` on back link.

**Fix:** Added `aria-label={t('common.backToProfile')}`.

---

### `apps/web/components/habits/description-viewer.tsx` - line 54-58
**Issue:** Back button in the full-screen description viewer had no `aria-label`.

**Fix:** Added `useTranslations` import and `aria-label={t('common.back')}` to the close button.

---

## 3. Untranslated Values (Identical in Both Locales)

These keys have the same value in en and pt-BR. All are intentional - they are either brand names, interpolation-only strings, or technical terms that are the same in Portuguese:

| Key | Value | Reason |
|-----|-------|--------|
| `gamification.categories.Volume` | `"Volume"` | Same word in pt-BR |
| `gamification.levels.12` | `"Orbit Elite"` | Brand name |
| `gamification.profileCard.xp` | `"{current} / {next} XP"` | Interpolation-only + "XP" is universal |
| `gamification.streak.currentShort` | `"{n}d"` | Abbreviation, same in pt-BR |
| `gamification.toast.xpEarned` | `"+{xp} XP"` | Interpolation-only |
| `gamification.xpReward` | `"+{n} XP"` | Interpolation-only |
| `goals.progressEntry` | `"{previous} -> {value} {unit}"` | Interpolation-only |
| `habits.detail.streakDays` | `"{n}d"` | Abbreviation |
| `habits.form.checklist` | `"Checklist"` | English loanword used in pt-BR |
| `habits.form.tags` | `"Tags"` | English loanword used in pt-BR |
| `habits.frequency.flexibleLabel` | `"{n}x / {unit}"` | Interpolation-only |
| `habits.search.matchTag` | `"tag: {value}"` | "tag" same in pt-BR |
| `onboarding.featureGuide.habitsSection.checklistsTitle` | `"Checklists"` | English loanword |
| `profile.facts.count` | `"{n} / {max}"` | Interpolation-only |
| `profile.subscription.pro` | `"Orbit Pro"` | Brand name |
| `streakDisplay.badge.days` | `"{count}"` | Interpolation-only |
| `trial.banner.upgrade` | `"Upgrade"` | English loanword used in pt-BR |
| `upgrade.billing.invoices.reasonManual` | `"Manual"` | Same word in pt-BR |

---

## 4. Backend Error Messages

**Frontend surfacing pattern:** All mutations use `getErrorMessage()` / `extractBackendError()` from `@orbit/shared/utils`, and errors are displayed via toast using the generic `common.error` key or specific `errors.*` keys from the locale. Backend validation messages that reach the client surface through `extractBackendError()` and are shown raw (untranslated). This is consistent with the Vue app's behavior.

**Assessment:** No new backend error message issues introduced. The pattern is consistent.

---

## 5. Interpolation Completeness

All `{placeholder}` parameters used in the codebase match the placeholders defined in the locale strings. One case warranted review:

- `t('habits.actions.unlog', { title: habit.title })` in `habit-card.tsx` - the `{title}` parameter is passed but not used in the string (`"Mark incomplete"`). The extra parameter is silently ignored by next-intl. This matches the Vue source behavior and is intentional (the parameter is available for future use or accessibility).

---

## 6. Pluralization

Both locales use the `|`-separated plural format (next-intl pipe syntax). Spot-checked:

- `habits.count: "no habits | one habit | {n} habits"` / pt-BR has equivalent
- `gamification.streak.longest: "Longest: {n} day | Longest: {n} days"` / pt-BR has equivalent
- `streakDisplay.freeze.available: "No freezes available | {count} freeze available | {count} freezes available"` / pt-BR has equivalent

All plural forms reviewed are present in both locales.

---

## Summary of Changes Made

| File | Change |
|------|--------|
| `packages/shared/src/i18n/en.json` | Added `common.unknown` and `orbitMcp.apiKeysError` |
| `packages/shared/src/i18n/pt-BR.json` | Added `common.unknown` and `orbitMcp.apiKeysError` |
| `apps/web/components/chat/typing-indicator.tsx` | Replace hardcoded "Orbit" with `t('chat.senderOrbit')` |
| `apps/web/app/(app)/preferences/page.tsx` | Fix `aria-label` on color scheme buttons to use `t('preferences.color*')` |
| `apps/web/components/onboarding/onboarding-welcome.tsx` | Same fix as preferences page |
| `apps/web/app/(app)/about/page.tsx` | Add `aria-label={t('common.backToProfile')}` to back link |
| `apps/web/app/(app)/achievements/page.tsx` | Add `aria-label={t('common.backToProfile')}` to back link |
| `apps/web/components/habits/description-viewer.tsx` | Add `useTranslations` + `aria-label={t('common.back')}` to close button |

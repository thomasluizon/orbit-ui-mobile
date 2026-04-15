import { useCallback } from 'react'
import {
  resolveAccessibleColorScheme,
  type ColorScheme,
  type ThemeMode,
} from '@orbit/shared'
import { useAppTheme } from '@/lib/use-app-theme'

/**
 * Mobile parity port of `apps/web/hooks/use-color-scheme.ts`.
 *
 * Web persists scheme/theme to two cookies + DB via Server Actions.
 * Mobile already owns scheme/theme via the `<ThemeProvider>` context
 * (see lib/theme-provider.tsx) backed by SecureStore + the user's
 * profile in the DB.
 *
 * This hook adapts that context to the same shape exposed by the web
 * hook so call sites can be moved across platforms with no signature
 * changes.
 */
export function useColorScheme() {
  const {
    currentScheme,
    currentTheme,
    applyScheme,
    applyTheme,
    toggleTheme,
  } = useAppTheme()

  const syncSchemeFromProfile = useCallback(
    (dbColorScheme: string | null, hasProAccess = true) => {
      if (!dbColorScheme) return
      const next = resolveAccessibleColorScheme(
        normalizeScheme(dbColorScheme),
        hasProAccess,
      )
      if (next && next !== currentScheme) {
        applyScheme(next)
      }
    },
    [applyScheme, currentScheme],
  )

  const detectAndSaveSchemeIfNeeded = useCallback(
    (dbColorScheme: string | null) => {
      // Mobile theme provider already persists on first load, so this is
      // a no-op kept for cross-platform parity.
      if (dbColorScheme !== null) return
      applyScheme(currentScheme)
    },
    [applyScheme, currentScheme],
  )

  const syncThemeFromProfile = useCallback(
    (dbThemePreference: string | null | undefined) => {
      const next: ThemeMode | null =
        dbThemePreference === 'dark' || dbThemePreference === 'light'
          ? dbThemePreference
          : null
      if (next && next !== currentTheme) {
        applyTheme(next)
      }
    },
    [applyTheme, currentTheme],
  )

  const detectAndSaveThemeIfNeeded = useCallback(
    (dbThemePreference: string | null | undefined) => {
      if (dbThemePreference === 'dark' || dbThemePreference === 'light') return
      // Native React Native does not expose a sync prefers-color-scheme
      // probe equivalent to web's matchMedia. Default to current theme;
      // the system-level dark mode listener is wired separately in the
      // theme provider.
      applyTheme(currentTheme)
    },
    [applyTheme, currentTheme],
  )

  return {
    currentScheme,
    currentTheme,
    applyScheme,
    applyTheme,
    toggleTheme,
    syncSchemeFromProfile,
    detectAndSaveSchemeIfNeeded,
    syncThemeFromProfile,
    detectAndSaveThemeIfNeeded,
  }
}

function normalizeScheme(value: string): ColorScheme {
  // Mirrors `normalizeColorScheme` from web's lib/theme-dom.ts —
  // trusts the value when it matches one of the known schemes,
  // otherwise falls back to purple.
  const valid: ColorScheme[] = [
    'purple', 'blue', 'green', 'orange', 'pink', 'rose',
  ] as ColorScheme[]
  return (valid as readonly string[]).includes(value)
    ? (value as ColorScheme)
    : ('purple' as ColorScheme)
}

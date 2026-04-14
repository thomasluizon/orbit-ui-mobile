import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  Animated,
  Appearance,
  Easing,
  Modal,
  StyleSheet,
  useColorScheme as useSystemColorScheme,
  View,
} from 'react-native'
import { API } from '@orbit/shared/api'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { useProfile } from '@/hooks/use-profile'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import {
  createColors,
  createNav,
  getRuntimeTheme,
  radius,
  shadows,
  setRuntimeTheme,
  type AppColors,
  type AppNav,
  type AppRadius,
  type AppShadows,
} from '@/lib/theme'
import { resolveAccessibleColorScheme } from '@orbit/shared/utils'

const VALID_COLOR_SCHEMES = new Set<ColorScheme>([
  'purple',
  'blue',
  'green',
  'rose',
  'orange',
  'cyan',
])

export interface ThemeContextValue {
  currentScheme: ColorScheme
  currentTheme: ThemeMode
  colors: AppColors
  nav: AppNav
  radius: AppRadius
  shadows: AppShadows
  applyScheme: (scheme: ColorScheme) => void
  applyTheme: (theme: ThemeMode) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

interface TransitionSnapshot {
  background: string
  accent: string
}

function normalizeColorScheme(value: string | null | undefined): ColorScheme {
  return value && VALID_COLOR_SCHEMES.has(value as ColorScheme)
    ? (value as ColorScheme)
    : 'purple'
}

function isValidColorScheme(value: string | null | undefined): value is ColorScheme {
  return !!value && VALID_COLOR_SCHEMES.has(value as ColorScheme)
}

function persistColorScheme(scheme: ColorScheme): Promise<unknown> {
  return performQueuedApiMutation({
    type: 'setColorScheme',
    scope: 'profile',
    endpoint: API.profile.colorScheme,
    method: 'PUT',
    payload: { colorScheme: scheme },
    dedupeKey: 'profile-color-scheme',
  })
}

function persistThemePreference(theme: ThemeMode): Promise<unknown> {
  return performQueuedApiMutation({
    type: 'setThemePreference',
    scope: 'profile',
    endpoint: API.profile.themePreference,
    method: 'PUT',
    payload: { themePreference: theme },
    dedupeKey: 'profile-theme-preference',
  })
}

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const systemScheme = useSystemColorScheme()
  const { profile, patchProfile } = useProfile()
  const [currentScheme, setCurrentScheme] = useState<ColorScheme>(
    resolveAccessibleColorScheme(profile?.colorScheme, profile?.hasProAccess ?? false),
  )
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(
    systemScheme === 'light' ? 'light' : 'dark',
  )
  const [transitionSnapshot, setTransitionSnapshot] = useState<TransitionSnapshot | null>(null)
  const transitionOpacity = useRef(new Animated.Value(0)).current
  const transitionFrameRef = useRef<number | null>(null)
  const hasMountedRef = useRef(false)
  const previousThemeRef = useRef<{ scheme: ColorScheme; theme: ThemeMode }>({
    scheme: currentScheme,
    theme: currentTheme,
  })

  const runThemeTransition = useCallback((snapshot: TransitionSnapshot) => {
    if (transitionFrameRef.current !== null) {
      cancelAnimationFrame(transitionFrameRef.current)
      transitionFrameRef.current = null
    }

    setTransitionSnapshot(snapshot)
    transitionOpacity.stopAnimation()
    transitionOpacity.setValue(1)

    transitionFrameRef.current = requestAnimationFrame(() => {
      Animated.timing(transitionOpacity, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }: { finished: boolean }) => {
        transitionFrameRef.current = null
        if (finished) {
          setTransitionSnapshot(null)
        }
      })
    })
  }, [transitionOpacity])

  useEffect(() => {
    setRuntimeTheme({ scheme: currentScheme, themeMode: currentTheme })
  }, [currentScheme, currentTheme])

  useEffect(() => {
    return () => {
      if (transitionFrameRef.current !== null) {
        cancelAnimationFrame(transitionFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      previousThemeRef.current = { scheme: currentScheme, theme: currentTheme }
      return
    }

    const previous = previousThemeRef.current
    if (previous.scheme !== currentScheme || previous.theme !== currentTheme) {
      const previousColors = createColors(previous.scheme, previous.theme)
      runThemeTransition({
        background: previousColors.background,
        accent: previousColors.primary,
      })
      previousThemeRef.current = { scheme: currentScheme, theme: currentTheme }
    }
  }, [currentScheme, currentTheme, runThemeTransition])

  // Hydrate theme state from profile and auto-detect-and-save on first login.
  useEffect(() => {
    if (!profile) return

    // syncSchemeFromProfile: DB -> state (no mutation).
    const accessibleScheme = resolveAccessibleColorScheme(
      profile.colorScheme,
      profile.hasProAccess,
    )
    if (accessibleScheme !== currentScheme) {
      const next = accessibleScheme
      setCurrentScheme(next)
      setRuntimeTheme({ scheme: next, themeMode: getRuntimeTheme().themeMode })
    }

    // syncThemeFromProfile: DB -> state (no mutation).
    if (
      (profile.themePreference === 'dark' || profile.themePreference === 'light') &&
      profile.themePreference !== currentTheme
    ) {
      const next = profile.themePreference
      setCurrentTheme(next)
      setRuntimeTheme({ scheme: getRuntimeTheme().scheme, themeMode: next })
    }

    // detectAndSaveSchemeIfNeeded: DB is null -> save default 'purple'.
    if (profile.colorScheme == null) {
      const defaultScheme: ColorScheme = 'purple'
      patchProfile({ colorScheme: defaultScheme })
      persistColorScheme(defaultScheme).catch(() => {
        // Best-effort fire-and-forget
      })
    }

    // detectAndSaveThemeIfNeeded: DB is null -> detect from system and save.
    if (profile.themePreference == null) {
      const detectedSystem = Appearance.getColorScheme()
      const detected: ThemeMode = detectedSystem === 'light' ? 'light' : 'dark'
      setCurrentTheme(detected)
      setRuntimeTheme({ scheme: getRuntimeTheme().scheme, themeMode: detected })
      patchProfile({ themePreference: detected })
      persistThemePreference(detected).catch(() => {
        // Best-effort fire-and-forget
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts only to profile.colorScheme / profile.themePreference
  }, [profile?.colorScheme, profile?.themePreference])

  const applyScheme = useCallback((scheme: ColorScheme) => {
    const prev = currentScheme
    setCurrentScheme(scheme)
    setRuntimeTheme({ scheme, themeMode: getRuntimeTheme().themeMode })
    patchProfile({ colorScheme: scheme })

    persistColorScheme(scheme).catch((_err: unknown) => {
      setCurrentScheme(prev)
      setRuntimeTheme({ scheme: prev, themeMode: getRuntimeTheme().themeMode })
      patchProfile({ colorScheme: prev })
    })
  }, [currentScheme, patchProfile])

  const applyTheme = useCallback((theme: ThemeMode) => {
    const prev = currentTheme
    setCurrentTheme(theme)
    setRuntimeTheme({ scheme: getRuntimeTheme().scheme, themeMode: theme })
    patchProfile({ themePreference: theme })

    persistThemePreference(theme).catch((_err: unknown) => {
      setCurrentTheme(prev)
      setRuntimeTheme({ scheme: getRuntimeTheme().scheme, themeMode: prev })
      patchProfile({ themePreference: prev })
    })
  }, [currentTheme, patchProfile])

  const toggleTheme = useCallback(() => {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark')
  }, [applyTheme, currentTheme])

  const value = useMemo<ThemeContextValue>(() => ({
    currentScheme,
    currentTheme,
    colors: createColors(currentScheme, currentTheme),
    nav: createNav(currentScheme, currentTheme),
    radius,
    shadows,
    applyScheme,
    applyTheme,
    toggleTheme,
  }), [applyScheme, applyTheme, currentScheme, currentTheme, toggleTheme])

  return (
    <ThemeContext.Provider value={value}>
      <View style={styles.root}>
        {children}
        {transitionSnapshot ? (
          <Modal
            transparent
            animationType="none"
            statusBarTranslucent
            visible
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.transitionOverlay,
                {
                  opacity: transitionOpacity,
                },
              ]}
            >
              <View
                style={[
                  styles.transitionBase,
                  { backgroundColor: transitionSnapshot.background },
                ]}
              />
              <View
                style={[
                  styles.transitionTint,
                  { backgroundColor: transitionSnapshot.accent },
                ]}
              />
            </Animated.View>
          </Modal>
        ) : null}
      </View>
    </ThemeContext.Provider>
  )
}

export function useThemeContext() {
  return useContext(ThemeContext)
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  transitionOverlay: {
    ...StyleSheet.absoluteFill,
  },
  transitionBase: {
    ...StyleSheet.absoluteFill,
  },
  transitionTint: {
    ...StyleSheet.absoluteFill,
    opacity: 0.12,
  },
})

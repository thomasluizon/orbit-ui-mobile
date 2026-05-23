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
  createSurfaces,
  getRuntimeTheme,
  radius,
  shadows,
  setRuntimeTheme,
  type AppColors,
  type AppNav,
  type AppRadius,
  type AppShadows,
  type AppSurfaces,
} from '@/lib/theme'
import { resolveAccessibleColorScheme } from '@orbit/shared/utils'

export interface ThemeContextValue {
  currentScheme: ColorScheme
  currentTheme: ThemeMode
  colors: AppColors
  nav: AppNav
  surfaces: AppSurfaces
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
  // useMemo (not useRef) for the Animated.Value so we don't read .current during
  // render — React 19's react-hooks/refs forbids that. The instance is created
  // once on mount and is referentially stable for the lifetime of the provider.
  const transitionOpacity = useMemo(() => new Animated.Value(0), [])
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

  // Sync local state from profile via the "Adjusting state when a prop changes"
  // pattern (compare prev-snapshot during render, setState only on transitions).
  // React 19 forbids setState in effects when the cause is a prop change.
  const targetScheme = profile
    ? resolveAccessibleColorScheme(profile.colorScheme, profile.hasProAccess)
    : null
  const [previousTargetScheme, setPreviousTargetScheme] = useState<ColorScheme | null>(targetScheme)
  if (targetScheme !== null && targetScheme !== previousTargetScheme) {
    setPreviousTargetScheme(targetScheme)
    setCurrentScheme(targetScheme)
  }

  const targetTheme =
    profile?.themePreference === 'dark' || profile?.themePreference === 'light'
      ? profile.themePreference
      : null
  const [previousTargetTheme, setPreviousTargetTheme] = useState<ThemeMode | null>(targetTheme)
  if (targetTheme !== null && targetTheme !== previousTargetTheme) {
    setPreviousTargetTheme(targetTheme)
    setCurrentTheme(targetTheme)
  }

  const hasSeededSchemeRef = useRef(false)
  const hasSeededThemeRef = useRef(false)

  useEffect(() => {
    if (!profile) return

    if (profile.colorScheme == null && !hasSeededSchemeRef.current) {
      hasSeededSchemeRef.current = true
      const defaultScheme: ColorScheme = 'purple'
      patchProfile({ colorScheme: defaultScheme })
      persistColorScheme(defaultScheme).catch(() => {
        // Best-effort fire-and-forget
      })
    }

    if (profile.themePreference == null && !hasSeededThemeRef.current) {
      hasSeededThemeRef.current = true
      const detectedSystem = Appearance.getColorScheme()
      const detected: ThemeMode = detectedSystem === 'light' ? 'light' : 'dark'
      void Promise.resolve().then(() => setCurrentTheme(detected))
      patchProfile({ themePreference: detected })
      persistThemePreference(detected).catch(() => {
        // Best-effort fire-and-forget
      })
    }
  }, [profile, patchProfile])

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
    surfaces: createSurfaces(currentScheme, currentTheme),
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

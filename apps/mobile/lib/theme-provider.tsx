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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Animated, Easing, Modal, StyleSheet, useColorScheme as useSystemColorScheme, View } from 'react-native'
import type { ColorScheme } from '@orbit/shared/theme'
import type { ThemeMode } from '@orbit/shared/types/profile'
import { useProfile } from '@/hooks/use-profile'
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

const THEME_STORAGE_KEY = 'orbit_theme_preference'
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

export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const systemScheme = useSystemColorScheme()
  const { profile } = useProfile()
  const [currentScheme, setCurrentScheme] = useState<ColorScheme>(
    normalizeColorScheme(profile?.colorScheme),
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
    let active = true

    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (!active) return
        if (stored === 'light' || stored === 'dark') {
          setCurrentTheme(stored)
        }
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const profileScheme = normalizeColorScheme(profile?.colorScheme)
    setCurrentScheme(profileScheme)
  }, [profile?.colorScheme])

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

  const applyScheme = useCallback((scheme: ColorScheme) => {
    setRuntimeTheme({ scheme, themeMode: getRuntimeTheme().themeMode })
    setCurrentScheme(scheme)
  }, [])

  const applyTheme = useCallback((theme: ThemeMode) => {
    AsyncStorage.setItem(THEME_STORAGE_KEY, theme).catch(() => {})
    setRuntimeTheme({ scheme: getRuntimeTheme().scheme, themeMode: theme })
    setCurrentTheme(theme)
  }, [])

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

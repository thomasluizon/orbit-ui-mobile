'use client'

import { useState, useEffect, useCallback } from 'react'
import { schemes, type ColorScheme, type ColorSchemeDefinition, type ThemeMode } from '@orbit/shared'
import { updateColorScheme as updateColorSchemeAction } from '@/app/actions/profile'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie)
  return match?.[1] ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string, maxAge = 60 * 60 * 24 * 365) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`
}

function applySchemeToDOM(scheme: ColorScheme, theme: ThemeMode, animate = false) {
  const def: ColorSchemeDefinition = schemes[scheme]
  const colors = def[theme]
  const root = document.documentElement

  if (animate) {
    root.classList.add('theme-transitioning')
    setTimeout(() => {
      root.classList.remove('theme-transitioning')
    }, 500)
  }

  // Toggle dark class for Tailwind dark: utilities
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }

  // Set color-scheme CSS property for browser native elements
  root.style.setProperty('color-scheme', theme)

  // Primary color (slightly darker for light mode for better contrast)
  const primary = theme === 'light' ? def.primaryLight : def.primary
  root.style.setProperty('--color-primary', primary)

  // Surface hierarchy
  root.style.setProperty('--color-background', colors.background)
  root.style.setProperty('--color-surface-ground', colors.surfaceGround)
  root.style.setProperty('--color-surface', colors.surface)
  root.style.setProperty('--color-surface-elevated', colors.surfaceElevated)
  root.style.setProperty('--color-surface-overlay', colors.surfaceOverlay)

  // Legacy aliases
  root.style.setProperty('--color-card', colors.surface)
  root.style.setProperty('--color-card-border', colors.surfaceElevated)

  // Border hierarchy
  root.style.setProperty('--color-border', colors.border)
  root.style.setProperty('--color-border-muted', colors.borderMuted)
  root.style.setProperty('--color-border-emphasis', colors.borderEmphasis)

  // Text hierarchy
  root.style.setProperty('--color-text-primary', colors.textPrimary)
  root.style.setProperty('--color-text-secondary', colors.textSecondary)
  root.style.setProperty('--color-text-muted', colors.textMuted)
  root.style.setProperty('--color-text-faded', colors.textFaded)
  root.style.setProperty('--color-text-inverse', colors.textInverse)

  // Shadow tokens
  root.style.setProperty('--shadow-sm', colors.shadowSm)
  root.style.setProperty('--shadow-md', colors.shadowMd)
  root.style.setProperty('--shadow-lg', colors.shadowLg)
  root.style.setProperty('--shadow-glow', colors.shadowGlow)
  root.style.setProperty('--shadow-glow-sm', colors.shadowGlowSm)
  root.style.setProperty('--shadow-glow-lg', colors.shadowGlowLg)

  // Nav glass tokens (used by BottomNav and chat)
  root.style.setProperty('--nav-glass-bg', colors.navGlassBg)
  root.style.setProperty('--nav-glass-border', colors.navGlassBorder)

  // Primary scale (stays the same regardless of theme)
  const s = def.scale
  root.style.setProperty('--color-primary-50', s[50] ?? '')
  root.style.setProperty('--color-primary-100', s[100] ?? '')
  root.style.setProperty('--color-primary-200', s[200] ?? '')
  root.style.setProperty('--color-primary-300', s[300] ?? '')
  root.style.setProperty('--color-primary-400', s[400] ?? '')
  root.style.setProperty('--color-primary-500', s[500] ?? '')
  root.style.setProperty('--color-primary-600', s[600] ?? '')
  root.style.setProperty('--color-primary-700', s[700] ?? '')
  root.style.setProperty('--color-primary-800', s[800] ?? '')
  root.style.setProperty('--color-primary-900', s[900] ?? '')
  root.style.setProperty('--color-primary-950', s[950] ?? '')
  root.style.setProperty('--primary-shadow', def.shadowRgb)

  // Date input calendar icon filter (invert for dark, none for light)
  root.style.setProperty('--date-icon-filter', theme === 'dark' ? 'invert(0.6)' : 'none')

  // Update theme-color meta tag dynamically
  const metaThemeColor = document.querySelector('meta[name="theme-color"]')
  if (metaThemeColor) {
    metaThemeColor.setAttribute('content', colors.background)
  }

  // Update apple-mobile-web-app-status-bar-style
  const metaStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
  if (metaStatusBar) {
    metaStatusBar.setAttribute('content', theme === 'dark' ? 'black-translucent' : 'default')
  }
}

const VALID_SCHEMES = new Set<ColorScheme>(['purple', 'blue', 'green', 'rose', 'orange', 'cyan'])

export function useColorScheme() {
  const [currentScheme, setCurrentScheme] = useState<ColorScheme>(() => {
    const cookie = getCookie('orbit_color_scheme')
    return cookie && VALID_SCHEMES.has(cookie as ColorScheme) ? (cookie as ColorScheme) : 'purple'
  })

  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(() => {
    const cookie = getCookie('orbit_theme_mode')
    return cookie === 'light' ? 'light' : 'dark'
  })

  // Apply scheme on mount and when values change
  useEffect(() => {
    applySchemeToDOM(currentScheme, currentTheme, false)
  }, [currentScheme, currentTheme])

  const applyScheme = useCallback((scheme: ColorScheme, persistToDb = true) => {
    setCookie('orbit_color_scheme', scheme)
    setCurrentScheme(scheme)
    applySchemeToDOM(scheme, currentTheme, true)

    if (persistToDb) {
      updateColorSchemeAction({ colorScheme: scheme }).catch(() => {})
    }
  }, [currentTheme])

  const applyTheme = useCallback((theme: ThemeMode) => {
    setCookie('orbit_theme_mode', theme)
    setCurrentTheme(theme)
    applySchemeToDOM(currentScheme, theme, true)
  }, [currentScheme])

  const toggleTheme = useCallback(() => {
    const next: ThemeMode = currentTheme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
  }, [currentTheme, applyTheme])

  /**
   * Sync cookie with DB value (DB is source of truth).
   * Call this after profile loads to ensure cross-device sync.
   */
  const syncSchemeFromProfile = useCallback((dbColorScheme: string | null) => {
    const dbScheme = (dbColorScheme && VALID_SCHEMES.has(dbColorScheme as ColorScheme))
      ? (dbColorScheme as ColorScheme)
      : null
    if (dbScheme && dbScheme !== currentScheme) {
      setCookie('orbit_color_scheme', dbScheme)
      setCurrentScheme(dbScheme)
      applySchemeToDOM(dbScheme, currentTheme)
    }
  }, [currentScheme, currentTheme])

  /**
   * First-login detection: if DB colorScheme is null, save current
   * cookie value (default purple) so future logins are consistent.
   */
  const detectAndSaveSchemeIfNeeded = useCallback((dbColorScheme: string | null) => {
    if (dbColorScheme !== null) return
    updateColorSchemeAction({ colorScheme: currentScheme }).catch(() => {})
  }, [currentScheme])

  return {
    currentScheme,
    currentTheme,
    applyScheme,
    applyTheme,
    toggleTheme,
    syncSchemeFromProfile,
    detectAndSaveSchemeIfNeeded,
  }
}

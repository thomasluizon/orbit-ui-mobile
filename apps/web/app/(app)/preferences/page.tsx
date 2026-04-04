'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Lock } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { useProfile } from '@/hooks/use-profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { ProBadge } from '@/components/ui/pro-badge'
import {
  updateWeekStartDay,
  updateColorScheme as updateColorSchemeAction,
} from '@/app/actions/profile'

export default function PreferencesPage() {
  const { profile, patchProfile } = useProfile()

  const { currentScheme, applyScheme, currentTheme, applyTheme } = useColorScheme()

  // --- Week Start Day ---
  const weekStartOptions = [
    { value: 1, label: 'Monday' },
    { value: 0, label: 'Sunday' },
  ]

  const weekStartMutation = useMutation({
    mutationFn: (day: number) => updateWeekStartDay({ weekStartDay: day }),
    onMutate: (day) => {
      const previous = profile?.weekStartDay
      patchProfile({ weekStartDay: day })
      return { previous }
    },
    onError: (_err, _day, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ weekStartDay: context.previous })
      }
    },
  })

  // --- Color Scheme ---
  const colorSchemeMutation = useMutation({
    mutationFn: (scheme: string) => updateColorSchemeAction({ colorScheme: scheme }),
    onMutate: (scheme) => {
      const previous = profile?.colorScheme
      patchProfile({ colorScheme: scheme })
      return { previous }
    },
    onError: (_err, _scheme, context) => {
      if (context?.previous !== undefined) {
        patchProfile({ colorScheme: context.previous })
        if (context.previous) {
          applyScheme(context.previous as ColorScheme)
        }
      }
    },
  })

  function handleSchemeChange(scheme: ColorScheme) {
    if (!profile?.hasProAccess && scheme !== 'purple') {
      return
    }
    applyScheme(scheme)
    colorSchemeMutation.mutate(scheme)
  }

  // --- Time Format (local-only preference) ---
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>(() => {
    if (typeof window === 'undefined') return '12h'
    return (localStorage.getItem('orbit_time_format') as '12h' | '24h') ?? '12h'
  })

  function handleTimeFormatChange(format: '12h' | '24h') {
    setTimeFormat(format)
    localStorage.setItem('orbit_time_format', format)
  }

  const timeFormatOptions = [
    { value: '12h' as const, label: '12-hour' },
    { value: '24h' as const, label: '24-hour' },
  ]

  // --- Home Screen Toggle (local-only preference) ---
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(() => {
    if (typeof window === 'undefined') return true
    return localStorage.getItem('orbit_show_general_on_today') !== 'false'
  })

  function toggleShowGeneral() {
    const next = !showGeneralOnToday
    setShowGeneralOnToday(next)
    localStorage.setItem('orbit_show_general_on_today', String(next))
  }

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label="Back to profile"
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          Preferences
        </h1>
      </header>

      <div className="space-y-4">
        {/* Color Scheme */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              Color Scheme
            </h2>
            <ProBadge />
          </div>
          <p className="text-sm text-text-secondary">
            Choose your accent color. Pro users can pick any scheme.
          </p>
          <div className="flex gap-3">
            {colorSchemeOptions.map((option) => (
              <button
                key={option.value}
                aria-label={option.value}
                aria-pressed={currentScheme === option.value}
                className={`size-9 rounded-full transition-all active:scale-90 flex items-center justify-center ${
                  currentScheme === option.value
                    ? 'ring-2 ring-offset-2 ring-offset-surface scale-110'
                    : 'hover:scale-105 opacity-70 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: option.color,
                  '--tw-ring-color': currentScheme === option.value ? option.color : undefined,
                } as React.CSSProperties}
                onClick={() => handleSchemeChange(option.value)}
              >
                {currentScheme === option.value && (
                  <Check className="size-4 text-white" />
                )}
                {!profile?.hasProAccess && option.value !== 'purple' && currentScheme !== option.value && (
                  <Lock className="size-3 text-white/70" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Time Format */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            Time Format
          </h2>
          <p className="text-sm text-text-secondary">
            Choose how times are displayed throughout the app.
          </p>
          <div className="flex gap-2">
            {timeFormatOptions.map((opt) => (
              <button
                key={opt.value}
                className={`px-4 py-2 rounded-[var(--radius-lg)] text-sm font-semibold transition-all ${
                  timeFormat === opt.value
                    ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                    : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => handleTimeFormatChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Week Start Day */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            Week Start Day
          </h2>
          <p className="text-sm text-text-secondary">
            Choose which day your week starts on for calendar views.
          </p>
          <div className="flex gap-2">
            {weekStartOptions.map((opt) => (
              <button
                key={opt.value}
                className={`px-4 py-2 rounded-[var(--radius-lg)] text-sm font-semibold transition-all ${
                  profile?.weekStartDay === opt.value
                    ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                    : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                }`}
                onClick={() => weekStartMutation.mutate(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Home Screen */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                Home Screen
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Show &quot;General&quot; habits on today view
              </p>
            </div>
            <button
              role="switch"
              aria-checked={showGeneralOnToday}
              aria-label="Show general habits on today"
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                showGeneralOnToday ? 'bg-primary' : 'bg-surface-elevated'
              }`}
              onClick={toggleShowGeneral}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  showGeneralOnToday ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

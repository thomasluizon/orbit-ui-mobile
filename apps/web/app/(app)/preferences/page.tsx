'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Lock } from 'lucide-react'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import type { SupportedLocale } from '@orbit/shared/types/profile'
import { useProfile } from '@/hooks/use-profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import { useAuthStore } from '@/stores/auth-store'
import { ProBadge } from '@/components/ui/pro-badge'
import {
  updateWeekStartDay,
  updateColorScheme as updateColorSchemeAction,
  updateLanguage,
} from '@/app/actions/profile'

// Language options matching Vue locales
const LANGUAGE_OPTIONS: { value: 'en' | 'pt-BR'; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'pt-BR', label: 'Português' },
]

export default function PreferencesPage() {
  const t = useTranslations()
  const router = useRouter()
  const { profile, patchProfile } = useProfile()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const { currentScheme, applyScheme } = useColorScheme()

  // Hydration guard: cookie/localStorage reads differ between server and client.
  // Defer client-only state until after mount to prevent aria-pressed mismatches.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // --- Language ---
  const [selectedLanguage, setSelectedLanguage] = useState('en')

  useEffect(() => {
    const match = /(?:^|; )i18n_locale=([^;]*)/.exec(document.cookie)
    if (match?.[1]) setSelectedLanguage(decodeURIComponent(match[1]))
  }, [])

  async function handleLanguageChange(locale: SupportedLocale) {
    setSelectedLanguage(locale)
    document.cookie = `i18n_locale=${encodeURIComponent(locale)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict`
    if (isAuthenticated) {
      try {
        await updateLanguage({ language: locale })
      } catch {
        // Error handled silently like Vue
      }
    }
    // Hard reload to re-trigger next-intl middleware with the new locale cookie
    // (router.refresh() alone does not re-evaluate middleware)
    globalThis.location.reload()
  }

  // --- Week Start Day ---
  const weekStartOptions = [
    { value: 1, label: t('settings.weekStartDay.monday') },
    { value: 0, label: t('settings.weekStartDay.sunday') },
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
      router.push('/upgrade')
      return
    }
    applyScheme(scheme)
    colorSchemeMutation.mutate(scheme)
  }

  // --- Time Format (local-only preference, cookie for SSR safety) ---
  const [timeFormat, setTimeFormat] = useState<'12h' | '24h'>('12h')

  useEffect(() => {
    // Check cookie first
    const match = /(?:^|; )orbit_time_format=([^;]*)/.exec(document.cookie)
    if (match?.[1]) { setTimeFormat(match[1] as '12h' | '24h'); return }
    // Migrate from localStorage if present
    const stored = localStorage.getItem('orbit_time_format') as '12h' | '24h' | null
    if (stored) { setTimeFormat(stored); return }
    // Auto-detect from browser locale
    try {
      const resolved = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions()
      setTimeFormat(resolved.hour12 ? '12h' : '24h')
    } catch { /* keep default */ }
  }, [])

  function handleTimeFormatChange(format: '12h' | '24h') {
    setTimeFormat(format)
    // Store in both cookie (SSR-safe) and localStorage (backward compat)
    document.cookie = `orbit_time_format=${format};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict`
    localStorage.setItem('orbit_time_format', format)
  }

  const timeFormatOptions = [
    { value: '12h' as const, label: t('settings.timeFormat.12h') },
    { value: '24h' as const, label: t('settings.timeFormat.24h') },
  ]

  // --- Home Screen Toggle (local-only preference) ---
  const [showGeneralOnToday, setShowGeneralOnToday] = useState(true)

  useEffect(() => {
    setShowGeneralOnToday(localStorage.getItem('orbit_show_general_on_today') !== 'false')
  }, [])

  function toggleShowGeneral() {
    const next = !showGeneralOnToday
    setShowGeneralOnToday(next)
    localStorage.setItem('orbit_show_general_on_today', String(next))
  }

  // --- Push Notifications ---
  const [pushSupported, setPushSupported] = useState(false)
  const [pushSubscribed, setPushSubscribed] = useState(false)
  const [pushPermission, setPushPermission] = useState<PermissionState | ''>('')
  const [pushLoading, setPushLoading] = useState(false)
  const [pushStatus, setPushStatus] = useState<
    'unsupported' | 'denied' | 'not-registered' | 'registered' | 'sync-failed' | 'requesting'
  >('unsupported')

  useEffect(() => {
    if (typeof globalThis === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in globalThis)) { // NOSONAR - SSR guard
      setPushSupported(false)
      setPushStatus('unsupported')
      return
    }

    setPushSupported(true)
    const permission = Notification.permission as PermissionState
    setPushPermission(permission)
    if (permission === 'denied') {
      setPushStatus('denied')
      return
    }

    // Check if already subscribed
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        const subscribed = !!sub && Notification.permission === 'granted'
        setPushSubscribed(subscribed)
        if (subscribed) {
          setPushStatus('registered')
        } else {
          setPushStatus(permission === 'granted' ? 'not-registered' : 'not-registered')
        }
      })
    }).catch(() => {})
  }, [])

  async function handleTogglePush() {
    setPushLoading(true)
    try {
      if (pushSubscribed) {
        // --- Unsubscribe ---
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          const keys = subscription.toJSON()
          // Notify backend to remove subscription
          await fetch('/api/notifications/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              endpoint: subscription.endpoint,
              p256dh: keys.keys?.p256dh,
              auth: keys.keys?.auth,
            }),
          })
          await subscription.unsubscribe()
        }
        setPushSubscribed(false)
        setPushStatus(pushPermission === 'granted' ? 'not-registered' : 'unsupported')
      } else {
        // --- Subscribe ---
        setPushStatus('requesting')
        // Skip permission prompt if already granted
        const permission = Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()
        setPushPermission(permission as PermissionState)
        if (permission !== 'granted') {
          setPushStatus(permission === 'denied' ? 'denied' : 'not-registered')
          return
        }

        const registration = await navigator.serviceWorker.ready

        // Unsubscribe any stale subscription first
        const existing = await registration.pushManager.getSubscription()
        if (existing) await existing.unsubscribe()

        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
        if (!vapidKey) return

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
        })

        const keys = subscription.toJSON()

        // Send subscription to backend
        const response = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint: subscription.endpoint,
            p256dh: keys.keys?.p256dh,
            auth: keys.keys?.auth,
          }),
        })
        if (!response.ok) {
          throw new Error(`Failed to subscribe: ${response.status}`)
        }

        setPushSubscribed(true)
        setPushStatus('registered')
      }
    } catch {
      setPushStatus('sync-failed')
      setPushSubscribed(false)
    } finally {
      setPushLoading(false)
    }
  }

  return (
    <div className="pb-8">
      <header className="pt-8 pb-6 flex items-center gap-3">
        <Link
          href="/profile"
          aria-label={t('common.backToProfile')}
          className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="text-[length:var(--text-fluid-2xl)] font-bold text-text-primary tracking-tight">
          {t('preferences.title')}
        </h1>
      </header>

      <div className="space-y-4">
        {/* Language */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            {t('profile.language.title')}
          </h2>
          <p className="text-sm text-text-secondary">
            {t('profile.language.description')}
          </p>
          <div className="flex gap-2">
            {LANGUAGE_OPTIONS.map((lang) => {
              const isActive = mounted && selectedLanguage === lang.value
              return (
                <button
                  key={lang.value}
                  aria-pressed={isActive}
                  className={`px-4 py-2 rounded-[var(--radius-lg)] text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                      : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => handleLanguageChange(lang.value)}
                >
                  {lang.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Color Scheme */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
              {t('profile.colorScheme.title')}
            </h2>
            <ProBadge />
          </div>
          <p className="text-sm text-text-secondary">
            {t('profile.colorScheme.description')}
          </p>
          <div className="flex gap-3">
            {colorSchemeOptions.map((option) => {
              const isActive = mounted && currentScheme === option.value
              return (
                <button
                  key={option.value}
                  aria-label={t(`preferences.color${option.value.charAt(0).toUpperCase() + option.value.slice(1)}` as Parameters<typeof t>[0])} // NOSONAR - dynamic i18n key requires assertion
                  aria-pressed={isActive}
                  className={`size-9 rounded-full transition-all active:scale-90 flex items-center justify-center ${
                    isActive
                      ? 'ring-2 ring-offset-2 ring-offset-surface scale-110'
                      : 'hover:scale-105 opacity-70 hover:opacity-100'
                  }`}
                  style={{
                    backgroundColor: option.color,
                    '--tw-ring-color': isActive ? option.color : undefined,
                  } as React.CSSProperties}
                  onClick={() => handleSchemeChange(option.value)}
                >
                  {isActive && (
                    <Check className="size-4 text-white" />
                  )}
                  {!profile?.hasProAccess && option.value !== 'purple' && !isActive && (
                    <Lock className="size-3 text-white/70" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Time Format */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            {t('settings.timeFormat.title')}
          </h2>
          <p className="text-sm text-text-secondary">
            {t('settings.timeFormat.description')}
          </p>
          <div className="flex gap-2">
            {timeFormatOptions.map((opt) => {
              const isActive = mounted && timeFormat === opt.value
              return (
                <button
                  key={opt.value}
                  aria-pressed={isActive}
                  className={`px-4 py-2 rounded-[var(--radius-lg)] text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                      : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => handleTimeFormatChange(opt.value)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Week Start Day */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
            {t('settings.weekStartDay.title')}
          </h2>
          <p className="text-sm text-text-secondary">
            {t('settings.weekStartDay.description')}
          </p>
          <div className="flex gap-2">
            {weekStartOptions.map((opt) => {
              const isActive = mounted && profile?.weekStartDay === opt.value
              return (
                <button
                  key={opt.value}
                  aria-pressed={isActive}
                  className={`px-4 py-2 rounded-[var(--radius-lg)] text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-[var(--shadow-glow-sm)]'
                      : 'bg-background border border-border text-text-secondary hover:text-text-primary'
                  }`}
                  onClick={() => weekStartMutation.mutate(opt.value)}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Home Screen */}
        <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {t('settings.homeScreen.title')}
              </h2>
              <p className="text-xs text-text-muted mt-1">
                {t('settings.homeScreen.showGeneralDesc')}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={mounted && showGeneralOnToday}
              aria-label={t('settings.homeScreen.showGeneral')}
              className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                mounted && showGeneralOnToday ? 'bg-primary' : 'bg-surface-elevated'
              }`}
              onClick={toggleShowGeneral}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  mounted && showGeneralOnToday ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Push Notifications */}
        {pushSupported && (
          <div className="bg-surface rounded-[var(--radius-xl)] border border-border-muted shadow-[var(--shadow-sm)] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-text-muted">
                {t('settings.notifications.title')}
              </h2>
              {pushPermission !== 'denied' && (
                <button
                  role="switch"
                  aria-checked={pushSubscribed}
                  aria-label={t('settings.notifications.title')}
                  disabled={pushLoading}
                  className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 ${
                    pushSubscribed ? 'bg-primary' : 'bg-surface-elevated'
                  }`}
                  onClick={handleTogglePush}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      pushSubscribed ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              )}
            </div>
            <p className="text-sm text-text-secondary">
              {t('settings.notifications.description')}
            </p>
            <p className={`text-xs font-medium ${
              pushStatus === 'denied' || pushStatus === 'sync-failed'
                ? 'text-red-400'
                : pushStatus === 'registered'
                  ? 'text-primary'
                  : 'text-text-muted'
            }`}>
              {pushStatus === 'denied'
                ? t('settings.notifications.denied')
                : pushStatus === 'requesting'
                  ? t('settings.notifications.requesting')
                  : pushStatus === 'registered'
                    ? t('settings.notifications.registered')
                    : pushStatus === 'sync-failed'
                      ? t('settings.notifications.syncFailed')
                      : pushStatus === 'not-registered' && pushPermission === 'granted'
                        ? t('settings.notifications.notRegistered')
                        : t('settings.notifications.disabled')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/** Convert a VAPID public key from URL-safe base64 to a Uint8Array for pushManager.subscribe */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replaceAll('-', '+').replaceAll('_', '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.codePointAt(i) ?? 0
  }
  return outputArray
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { Check, Lock } from 'lucide-react'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import {
  buildWeekStartOptions,
  LANGUAGE_OPTIONS,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import type { SupportedLocale } from '@orbit/shared/types/profile'
import { useIsClient } from '@/hooks/use-is-client'
import { useProfile } from '@/hooks/use-profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  getPushStatusMessageKey,
  getPushStatusTone,
  usePushNotificationPreferences,
} from '@/hooks/use-push-notification-preferences'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useAuthStore } from '@/stores/auth-store'
import { AppBar } from '@/components/ui/app-bar'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow } from '@/components/ui/settings-row'
import { Chip } from '@/components/ui/chip'
import { MonoToggle } from '@/components/ui/mono-toggle'
import { ProBadge } from '@/components/ui/pro-badge'
import {
  updateWeekStartDay,
  updateColorScheme as updateColorSchemeAction,
  updateLanguage,
} from '@/app/actions/profile'

interface SchemeSwatchesProps {
  active: ColorScheme
  hasProAccess: boolean
  mounted: boolean
  onSelect: (scheme: ColorScheme) => void
  t: ReturnType<typeof useTranslations>
}

function SchemeSwatches({ active, hasProAccess, mounted, onSelect, t }: Readonly<SchemeSwatchesProps>) {
  return (
    <div className="flex items-center" style={{ gap: 12 }}>
      {colorSchemeOptions.map((option) => {
        const isActive = mounted && active === option.value
        const isLocked = !hasProAccess && option.value !== 'purple'
        const ariaLabel = t(
          `preferences.color${option.value.charAt(0).toUpperCase() + option.value.slice(1)}` as Parameters<typeof t>[0],
        ) // NOSONAR - dynamic i18n key
        return (
          <button
            key={option.value}
            type="button"
            aria-label={ariaLabel}
            aria-pressed={isActive}
            onClick={() => onSelect(option.value)}
            className="appearance-none border-0 cursor-pointer inline-flex items-center justify-center shrink-0 transition-[opacity,box-shadow] duration-150 ease-out hover:opacity-80"
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: option.color,
              boxShadow: isActive ? 'inset 0 0 0 2px var(--fg-1)' : 'none',
            }}
          >
            {isActive && (
              <Check
                size={11}
                strokeWidth={2.5}
                color="var(--fg-on-primary)"
                style={{ filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.4))' }}
              />
            )}
            {!isActive && isLocked && (
              <Lock size={9} strokeWidth={2} color="rgba(255,255,255,0.65)" />
            )}
          </button>
        )
      })}
    </div>
  )
}

export default function PreferencesPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const { currentScheme, applyScheme } = useColorScheme()
  const {
    supported: pushSupported,
    subscribed: pushSubscribed,
    permission: pushPermission,
    loading: pushLoading,
    status: pushStatus,
    togglePush: handleTogglePush,
  } = usePushNotificationPreferences()

  const mounted = useIsClient()

  useEffect(() => {
    localStorage.removeItem('orbit_time_format')
    document.cookie = 'orbit_time_format=;max-age=0;path=/;samesite=strict'
  }, [])

  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    if (typeof document === 'undefined') return 'en'
    const match = /(?:^|; )i18n_locale=([^;]*)/.exec(document.cookie)
    return match?.[1] ? decodeURIComponent(match[1]) : 'en'
  })

  const handleLanguageChange = useCallback(
    async (locale: SupportedLocale) => {
      setSelectedLanguage(locale)
      if (typeof document !== 'undefined') {
        document.cookie = `i18n_locale=${encodeURIComponent(locale)};max-age=${365 * 24 * 60 * 60};path=/;samesite=strict`
      }
      if (isAuthenticated) {
        try {
          await updateLanguage({ language: locale })
        } catch {
          // Error handled silently
        }
      }
      globalThis.location.reload()
    },
    [isAuthenticated],
  )

  const weekStartOptions = buildWeekStartOptions(t)

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

  const [showGeneralOnToday, setShowGeneralOnToday] = useState<boolean>(() => {
    if (typeof localStorage === 'undefined') return false
    return parseShowGeneralOnTodayPreference(localStorage.getItem('orbit_show_general_on_today'))
  })

  function toggleShowGeneral() {
    const next = !showGeneralOnToday
    setShowGeneralOnToday(next)
    localStorage.setItem('orbit_show_general_on_today', String(next))
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('preferences.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <SectionLabel>{t('profile.language.title')}</SectionLabel>
        <div
          className="flex items-center"
          style={{
            padding: '0 20px 12px',
            gap: 6,
            flexWrap: 'wrap',
          }}
        >
          {LANGUAGE_OPTIONS.map((lang) => {
            const isActive = mounted && selectedLanguage === lang.value
            return (
              <Chip
                key={lang.value}
                active={isActive}
                onClick={() => handleLanguageChange(lang.value)}
                ariaLabel={lang.label}
              >
                {lang.label}
              </Chip>
            )
          })}
        </div>
        <SettingsDescription>{t('profile.language.description')}</SettingsDescription>

        <SectionLabel trailing={<ProBadge />}>{t('profile.colorScheme.title')}</SectionLabel>
        <div
          className="flex items-center justify-end"
          style={{
            padding: '4px 20px 12px',
            gap: 12,
          }}
        >
          <SchemeSwatches
            active={currentScheme}
            hasProAccess={profile?.hasProAccess ?? false}
            mounted={mounted}
            onSelect={handleSchemeChange}
            t={t}
          />
        </div>
        <SettingsDescription>{t('profile.colorScheme.description')}</SettingsDescription>

        <SectionLabel>{t('settings.weekStartDay.title')}</SectionLabel>
        <div
          className="flex items-center justify-end"
          style={{
            padding: '4px 20px 12px',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div className="flex items-center" style={{ gap: 4 }}>
            {weekStartOptions.map((opt) => {
              const isActive = mounted && profile?.weekStartDay === opt.value
              return (
                <Chip
                  key={opt.value}
                  active={isActive}
                  onClick={() => weekStartMutation.mutate(opt.value)}
                  ariaLabel={opt.label}
                >
                  {opt.label}
                </Chip>
              )
            })}
          </div>
        </div>
        <SettingsDescription>{t('settings.weekStartDay.description')}</SettingsDescription>

        <SectionLabel>{t('settings.homeScreen.title')}</SectionLabel>
        <SettingsRow label={t('settings.homeScreen.showGeneral')} accessory="none" divider={false}>
          <MonoToggle
            on={mounted && showGeneralOnToday}
            onToggle={toggleShowGeneral}
            ariaLabel={t('settings.homeScreen.showGeneral')}
          />
        </SettingsRow>
        <SettingsDescription>{t('settings.homeScreen.showGeneralDesc')}</SettingsDescription>

        {pushSupported && (
          <>
            <SectionLabel>{t('settings.notifications.title')}</SectionLabel>
            <SettingsRow label={t('settings.notifications.allowed')} accessory="none">
              {pushPermission !== 'denied' && (
                <MonoToggle
                  on={pushSubscribed}
                  onToggle={handleTogglePush}
                  ariaLabel={t('settings.notifications.title')}
                  disabled={pushLoading}
                />
              )}
            </SettingsRow>
            <div
              style={{
                padding: '0 20px 6px',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 13,
                fontStyle: 'italic',
                color: 'var(--fg-3)',
              }}
            >
              {t('settings.notifications.description')}
            </div>
            <div
              className={getPushStatusTone(pushStatus)}
              style={{
                padding: '0 20px 14px',
                fontFamily: 'var(--font-family-sans)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {t(getPushStatusMessageKey(pushStatus, pushPermission))}
            </div>
          </>
        )}
        <div style={{ height: 24 }} />
      </div>
    </div>
  )
}

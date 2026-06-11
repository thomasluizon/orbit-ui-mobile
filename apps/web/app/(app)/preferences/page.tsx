'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { Calendar, Check, Languages, Moon, Palette } from 'lucide-react'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import {
  buildWeekStartOptions,
  LANGUAGE_OPTIONS,
  parseShowGeneralOnTodayPreference,
} from '@orbit/shared/utils'
import type { SupportedLocale, ThemeMode } from '@orbit/shared/types/profile'
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
import { AppOverlay } from '@/components/ui/app-overlay'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsDescription } from '@/components/ui/settings-description'
import { SettingsRow, Switch } from '@/components/ui/settings-row'
import { RadioRow } from '@/components/ui/select-check'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import {
  updateWeekStartDay,
  updateColorScheme as updateColorSchemeAction,
  updateLanguage,
} from '@/app/actions/profile'

type PreferencePicker = 'language' | 'theme' | 'scheme' | 'weekStart'

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function SchemeDot({ color }: Readonly<{ color: string }>) {
  return (
    <span
      aria-hidden="true"
      className="rounded-full shrink-0"
      style={{ width: 12, height: 12, background: color }}
    />
  )
}

export default function PreferencesPage() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const { profile, patchProfile } = useProfile()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const { currentScheme, currentTheme, applyScheme, applyTheme } = useColorScheme()
  const {
    supported: pushSupported,
    subscribed: pushSubscribed,
    permission: pushPermission,
    loading: pushLoading,
    status: pushStatus,
    togglePush: handleTogglePush,
  } = usePushNotificationPreferences()

  const mounted = useIsClient()
  const [activePicker, setActivePicker] = useState<PreferencePicker | null>(null)

  useEffect(() => {
    localStorage.removeItem('orbit_time_format')
    document.cookie = 'orbit_time_format=;max-age=0;path=/;samesite=strict'
  }, [])

  const locale = useLocale()
  const [selectedLanguage, setSelectedLanguage] = useState<string>(locale)

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
      setActivePicker(null)
      router.push('/upgrade')
      return
    }
    applyScheme(scheme)
    colorSchemeMutation.mutate(scheme)
  }

  function handleThemeModeChange(mode: ThemeMode) {
    if (mode === currentTheme) return
    applyTheme(mode)
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

  const themeModeOptions: { value: ThemeMode; label: string }[] = [
    { value: 'dark', label: t('preferences.themeModeDark') },
    { value: 'light', label: t('preferences.themeModeLight') },
  ]

  const languageLabel = LANGUAGE_OPTIONS.find(
    (lang) => lang.value === selectedLanguage,
  )?.label
  const themeLabel = themeModeOptions.find(
    (mode) => mode.value === currentTheme,
  )?.label
  const schemeOption = colorSchemeOptions.find(
    (option) => option.value === currentScheme,
  )
  const schemeLabel = schemeOption
    ? t(`preferences.color${capitalize(schemeOption.value)}` as Parameters<typeof t>[0])
    : undefined
  const weekStartLabel = weekStartOptions.find(
    (option) => option.value === profile?.weekStartDay,
  )?.label

  const pickerTitles: Record<PreferencePicker, string> = {
    language: t('profile.language.title'),
    theme: t('preferences.themeMode'),
    scheme: t('profile.colorScheme.title'),
    weekStart: t('settings.weekStartDay.title'),
  }

  function closePicker() {
    setActivePicker(null)
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <AppBar
        back
        backLabel={t('common.backToProfile')}
        onBack={() => goBackOrFallback('/profile')}
        title={t('preferences.title')}
      />
      <div className="flex-1 min-h-0 overflow-y-auto stagger-enter">
        <SectionLabel bottom={4}>{t('preferences.general')}</SectionLabel>
        <SettingsRow
          icon={Languages}
          label={t('profile.language.title')}
          desc={t('profile.language.description')}
          value={mounted ? languageLabel : undefined}
          onClick={() => setActivePicker('language')}
          divider={false}
        />
        <SettingsRow
          icon={Moon}
          label={t('preferences.themeMode')}
          value={mounted ? themeLabel : undefined}
          onClick={() => setActivePicker('theme')}
          divider={false}
        />
        <SettingsRow
          icon={Palette}
          label={t('profile.colorScheme.title')}
          desc={t('profile.colorScheme.description')}
          value={mounted ? schemeLabel : undefined}
          onClick={() => setActivePicker('scheme')}
          divider={false}
        >
          {mounted && schemeOption ? <SchemeDot color={schemeOption.color} /> : null}
          <ProBadge />
        </SettingsRow>
        <SettingsRow
          icon={Calendar}
          label={t('settings.weekStartDay.title')}
          desc={t('settings.weekStartDay.description')}
          value={mounted ? weekStartLabel : undefined}
          onClick={() => setActivePicker('weekStart')}
          divider={false}
        />

        <SectionLabel bottom={4}>{t('settings.homeScreen.title')}</SectionLabel>
        <SettingsRow
          label={t('settings.homeScreen.showGeneral')}
          desc={t('settings.homeScreen.showGeneralDesc')}
          accessory="none"
          divider={false}
        >
          <Switch
            on={mounted && showGeneralOnToday}
            onToggle={toggleShowGeneral}
            ariaLabel={t('settings.homeScreen.showGeneral')}
          />
        </SettingsRow>

        {pushSupported && (
          <>
            <SectionLabel bottom={4}>{t('settings.notifications.title')}</SectionLabel>
            <SettingsRow
              label={t('settings.notifications.allowed')}
              accessory="none"
              divider={false}
            >
              {pushPermission !== 'denied' && (
                <Switch
                  on={pushSubscribed}
                  onToggle={handleTogglePush}
                  ariaLabel={t('settings.notifications.title')}
                  disabled={pushLoading}
                />
              )}
            </SettingsRow>
            <SettingsDescription>
              {t('settings.notifications.description')}
            </SettingsDescription>
            <div
              className={getPushStatusTone(pushStatus)}
              style={{
                padding: '0 20px 14px',
                fontFamily: 'var(--font-sans)',
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

      <AppOverlay
        open={activePicker !== null}
        onOpenChange={(open) => {
          if (!open) closePicker()
        }}
        title={activePicker ? pickerTitles[activePicker] : undefined}
        footer={
          activePicker === 'scheme' ? (
            <PillButton
              variant="white"
              fullWidth
              onClick={closePicker}
              leading={<Check size={18} strokeWidth={2} aria-hidden="true" />}
            >
              {t('common.save')}
            </PillButton>
          ) : undefined
        }
      >
        {activePicker === 'language' &&
          LANGUAGE_OPTIONS.map((lang, index) => (
            <RadioRow
              key={lang.value}
              label={lang.label}
              selected={mounted && selectedLanguage === lang.value}
              divider={index < LANGUAGE_OPTIONS.length - 1}
              onClick={() => {
                closePicker()
                void handleLanguageChange(lang.value)
              }}
            />
          ))}
        {activePicker === 'theme' &&
          themeModeOptions.map((mode, index) => (
            <RadioRow
              key={mode.value}
              label={mode.label}
              selected={mounted && currentTheme === mode.value}
              divider={index < themeModeOptions.length - 1}
              onClick={() => {
                closePicker()
                handleThemeModeChange(mode.value)
              }}
            />
          ))}
        {activePicker === 'scheme' &&
          colorSchemeOptions.map((option, index) => (
            <RadioRow
              key={option.value}
              label={t(
                `preferences.color${capitalize(option.value)}` as Parameters<typeof t>[0],
              )}
              selected={mounted && currentScheme === option.value}
              dot={option.color}
              divider={index < colorSchemeOptions.length - 1}
              onClick={() => {
                handleSchemeChange(option.value)
              }}
            />
          ))}
        {activePicker === 'weekStart' &&
          weekStartOptions.map((option, index) => (
            <RadioRow
              key={option.value}
              label={option.label}
              selected={mounted && profile?.weekStartDay === option.value}
              divider={index < weekStartOptions.length - 1}
              onClick={() => {
                closePicker()
                weekStartMutation.mutate(option.value)
              }}
            />
          ))}
      </AppOverlay>
    </div>
  )
}

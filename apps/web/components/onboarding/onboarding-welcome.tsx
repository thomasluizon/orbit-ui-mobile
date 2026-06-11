'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'
import { profileKeys } from '@orbit/shared/query'
import type { Profile } from '@orbit/shared/types/profile'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { ONBOARDING_WEEK_START_OPTIONS } from '@orbit/shared/utils'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { useColorScheme } from '@/hooks/use-color-scheme'
import {
  updateWeekStartDay,
  updateColorScheme as updateColorSchemeAction,
} from '@/app/actions/profile'
import type { ReactNode } from 'react'
import { AppLogo } from '@/components/ui/app-logo'
import { Chip } from '@/components/ui/chip'

export function OnboardingWelcome() {
  const t = useTranslations()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const { currentScheme, applyScheme } = useColorScheme()

  const weekStartDayMutation = useMutation({
    mutationFn: (day: number) => updateWeekStartDay({ weekStartDay: day }),
    onMutate: async (newDay) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.all })
      const prev = queryClient.getQueryData<Profile>(profileKeys.detail())
      queryClient.setQueryData<Profile>(profileKeys.detail(), (old) =>
        old ? { ...old, weekStartDay: newDay } : old,
      )
      return { prev }
    },
    onError: (_err, _newDay, context) => {
      if (context?.prev) {
        queryClient.setQueryData<Profile>(profileKeys.detail(), context.prev)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })

  const colorSchemeMutation = useMutation({
    mutationFn: (scheme: string) => updateColorSchemeAction({ colorScheme: scheme }),
  })

  function handleWeekStartDaySelect(day: number) {
    weekStartDayMutation.mutate(day)
  }

  function handleSchemeSelect(scheme: ColorScheme) {
    applyScheme(scheme)
    colorSchemeMutation.mutate(scheme)
  }

  const weekStartDay = profile?.weekStartDay ?? 1

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '16px 0' }}>
      <div
        className="flex flex-col items-center"
        style={{ gap: 20, paddingTop: 14 }}
      >
        <div
          className="flex items-center justify-center rounded-full"
          style={{
            width: 116,
            height: 116,
            background: 'rgba(var(--primary-rgb), 0.14)',
            animation: 'fresh-start-orb 0.6s var(--ease-out) both',
          }}
        >
          <AppLogo size={56} />
        </div>
        <h1
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 28,
            fontWeight: 500,
            letterSpacing: '-0.01em',
            lineHeight: 1.15,
            color: 'var(--fg-1)',
            margin: 0,
          }}
        >
          {t('onboarding.flow.welcome.title')}
        </h1>
        <p
          className="text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            color: 'var(--fg-2)',
            lineHeight: 1.55,
            margin: 0,
            maxWidth: 300,
          }}
        >
          {t('onboarding.flow.welcome.subtitle')}
        </p>
      </div>

      <div>
        <OnboardingSectionLabel>
          {t('onboarding.flow.welcome.weekStart')}
        </OnboardingSectionLabel>
        <div className="flex justify-center" style={{ gap: 12 }}>
          {ONBOARDING_WEEK_START_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              active={weekStartDay === option.value}
              onClick={() => handleWeekStartDaySelect(option.value)}
            >
              {t(option.labelKey)}
            </Chip>
          ))}
        </div>
      </div>

      {hasProAccess && (
        <div>
          <OnboardingSectionLabel>
            {t('onboarding.flow.welcome.colorScheme')}
          </OnboardingSectionLabel>
          <div className="flex justify-center" style={{ gap: 12 }}>
            {colorSchemeOptions.map((option) => {
              const isActive = currentScheme === option.value
              return (
                <button
                  type="button"
                  key={option.value}
                  className="appearance-none border-0 cursor-pointer"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    background: option.color,
                    boxShadow: isActive
                      ? 'inset 0 0 0 2px var(--bg), 0 0 0 2px var(--fg-1)'
                      : 'inset 0 0 0 1px var(--hairline-strong)',
                  }}
                  aria-label={t(
                    `preferences.color${option.value.charAt(0).toUpperCase() + option.value.slice(1)}` as Parameters<typeof t>[0],
                  )}
                  aria-pressed={isActive}
                  onClick={() => handleSchemeSelect(option.value)}
                />
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function OnboardingSectionLabel({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div
      className="text-center uppercase"
      style={{
        fontFamily: 'var(--font-sans)',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.08em',
        color: 'var(--fg-3)',
        paddingTop: 12,
        paddingBottom: 10,
      }}
    >
      {children}
    </div>
  )
}

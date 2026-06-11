import { useEffect, useMemo } from 'react'
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { profileKeys } from '@orbit/shared/query'
import { colorSchemeOptions, type ColorScheme } from '@orbit/shared/theme'
import { ONBOARDING_WEEK_START_OPTIONS } from '@orbit/shared/utils/onboarding'
import { useProfile, useHasProAccess } from '@/hooks/use-profile'
import { API } from '@orbit/shared/api'
import { performQueuedApiMutation } from '@/lib/queued-api-mutation'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { usePrefersReducedMotion } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'
import { Chip } from '@/components/ui/chip'
import { AppLogo } from '@/components/ui/app-logo'

interface OnboardingProfileState {
  colorScheme?: string
  weekStartDay?: number
}

/**
 * ob-1 Welcome step: tinted hero disc + logo, week-start chips, scheme
 * swatches. Pure visual rewrite -- preserves the week-start mutation.
 */
export function OnboardingWelcome() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { profile } = useProfile()
  const hasProAccess = useHasProAccess()
  const { currentScheme, currentTheme, applyScheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const prefersReducedMotion = usePrefersReducedMotion()
  const heroScale = useMemo(() => new Animated.Value(0), [])

  useEffect(() => {
    if (prefersReducedMotion) {
      heroScale.setValue(1)
      return
    }
    const animation = Animated.spring(heroScale, {
      toValue: 1,
      stiffness: 220,
      damping: 22,
      mass: 1,
      useNativeDriver: true,
    })
    animation.start()
    return () => animation.stop()
  }, [heroScale, prefersReducedMotion])

  const selectedScheme =
    (profile as OnboardingProfileState | null)?.colorScheme ?? 'purple'

  const weekStartDayMutation = useMutation({
    mutationFn: (day: number) =>
      performQueuedApiMutation({
        type: 'setWeekStartDay',
        scope: 'profile',
        endpoint: API.profile.weekStartDay,
        method: 'PUT',
        payload: { weekStartDay: day },
        dedupeKey: 'onboarding-week-start-day',
      }),
    onMutate: async (newDay) => {
      await queryClient.cancelQueries({ queryKey: profileKeys.all })
      const prev = queryClient.getQueryData<OnboardingProfileState>(
        profileKeys.detail(),
      )
      queryClient.setQueryData<OnboardingProfileState>(
        profileKeys.detail(),
        (old) => (old ? { ...old, weekStartDay: newDay } : old),
      )
      return { prev }
    },
    onError: (_err, _newDay, context) => {
      if (context?.prev) {
        queryClient.setQueryData<OnboardingProfileState>(
          profileKeys.detail(),
          context.prev,
        )
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })

  function handleWeekStartDaySelect(day: number) {
    weekStartDayMutation.mutate(day)
  }

  function handleSchemeSelect(scheme: ColorScheme) {
    applyScheme(scheme)
  }

  const weekStartDay = profile?.weekStartDay ?? 1

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.heroDisc,
          {
            opacity: heroScale,
            transform: [
              {
                scale: heroScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.3, 1],
                }),
              },
            ],
          },
        ]}
      >
        <AppLogo size={56} />
      </Animated.View>

      <Text style={styles.title}>{t('onboarding.flow.welcome.title')}</Text>
      <Text style={styles.subtitle}>
        {t('onboarding.flow.welcome.subtitle')}
      </Text>

      <Text style={styles.sectionLabel}>
        {t('onboarding.flow.welcome.weekStart')}
      </Text>
      <View style={styles.chipsRow}>
        {ONBOARDING_WEEK_START_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            active={weekStartDay === option.value}
            onPress={() => handleWeekStartDaySelect(option.value)}
          >
            {t(option.labelKey)}
          </Chip>
        ))}
      </View>

      {hasProAccess && (
        <>
          <Text style={styles.sectionLabel}>
            {t('onboarding.flow.welcome.colorScheme')}
          </Text>
          <View style={styles.schemeRow}>
            {colorSchemeOptions.map((option) => {
              const isActive = selectedScheme === option.value
              return (
                <Pressable
                  key={option.value}
                  onPress={() => handleSchemeSelect(option.value)}
                  style={[
                    styles.schemeBtn,
                    {
                      backgroundColor: option.color,
                      borderColor: isActive
                        ? tokens.fg1
                        : tokens.hairlineStrong,
                    },
                  ]}
                />
              )
            })}
          </View>
        </>
      )}
    </View>
  )
}

function createStyles(tokens: AppTokensV2) {
  return StyleSheet.create({
    container: {
      alignItems: 'center',
      gap: 14,
      paddingTop: 14,
      paddingBottom: 24,
    },
    heroDisc: {
      width: 116,
      height: 116,
      borderRadius: 999,
      backgroundColor: tintFromPrimary(tokens, 0.14),
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    title: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 28,
      letterSpacing: -0.28,
      lineHeight: 32,
      color: tokens.fg1,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 16,
      lineHeight: 25,
      color: tokens.fg2,
      textAlign: 'center',
      paddingHorizontal: 12,
      maxWidth: 300,
    },
    sectionLabel: {
      fontFamily: 'Rubik_500Medium',
      fontSize: 12,
      letterSpacing: 0.96,
      textTransform: 'uppercase',
      color: tokens.fg3,
      marginTop: 16,
      alignSelf: 'center',
      textAlign: 'center',
    },
    chipsRow: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 6,
    },
    schemeRow: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'center',
      flexWrap: 'wrap',
    },
    schemeBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
    },
  })
}

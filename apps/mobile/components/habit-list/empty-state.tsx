import { IconButton } from '@/components/ui/icon-button'
import { RefreshCw } from '@/components/ui/icons'
import { OrbitHop } from '@/components/ui/orbit-hop'
import { OrbitMascot, useStateMascotSize } from '@/components/ui/orbit-mascot'
import { orbitMascotHeight } from '@orbit/shared/contracts/brand'
import { SPACING, TOUCH_TARGET_MIN, WIDE_DESKTOP_BREAKPOINT } from '@orbit/shared/theme'

import { ActionRow } from '@/components/ui/action-row'
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { HABIT_FREQUENCY_FILTER_OPTIONS } from '@orbit/shared/utils/habit-frequency-filter'
import type { HabitFrequencyFilter } from '@orbit/shared/stores'
import { useUIStore } from '@/stores/ui-store'

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionIcon?: 'refresh'
  actionLabel?: string
  onAction?: () => void
  askOrbitLabel?: string
  onAskOrbit?: () => void
  variant?: 'primary' | 'secondary'
}

function filledVariantFor(width: number): 'primary' | 'secondary' {
  return width >= WIDE_DESKTOP_BREAKPOINT ? 'secondary' : 'primary'
}

export function HabitListEmptyState({
  title,
  description,
  actionIcon,
  actionLabel,
  onAction,
  askOrbitLabel,
  onAskOrbit,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const mascotSize = useStateMascotSize()
  const { width } = useWindowDimensions()
  const isOrbitPrompt = variant === 'primary'
  const hasDistinctDescription = Boolean(description) && description !== title
  const showOrbitAction =
    isOrbitPrompt && Boolean(askOrbitLabel) && Boolean(onAskOrbit)
  const showActions =
    showOrbitAction || (isOrbitPrompt && Boolean(actionLabel))

  let emptyActions: ReactNode = null
  if (showActions) {
    emptyActions = (
      <View style={styles.actions}><ActionRow align="center">
        {actionLabel ? (
          <PillButton
            variant="ghost"

            onClick={onAction}

          >
            {actionLabel}
          </PillButton>
        ) : null}
        {showOrbitAction && askOrbitLabel ? (
          <PillButton
            variant={filledVariantFor(width)}
            onClick={onAskOrbit}

          >
            {askOrbitLabel}
          </PillButton>
        ) : null}
      </ActionRow></View>
    )
  } else if (actionIcon && actionLabel) {
    emptyActions = <IconButton label={actionLabel} onClick={onAction}><RefreshCw size={20} accessible={false} /></IconButton>
  } else if (actionLabel) {
    emptyActions = (
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={({ pressed }) => [styles.linkAction, pressed ? { backgroundColor: tokens.bgHover } : null]}
      >
        <Text
          style={[
            styles.linkActionText,
            { color: tokens.fg1, textDecorationColor: tokens.hairlineStrong },
          ]}
        >
          {actionLabel}
        </Text>
      </Pressable>
    )
  }

  return (
    <View style={styles.container}>
      <OrbitMascot size={mascotSize} />
      <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {hasDistinctDescription ? (
        <Text style={[styles.description, { color: tokens.fg2 }]}>{description}</Text>
      ) : null}
      {emptyActions}
    </View>
  )
}

/** The completed day: Orbit in Feliz. With the guided flows on, it draws at the state size and hops once while the celebration of the completed day is the active one, and never on a later visit. With them off, it draws at 96 with no hop. */
export function HabitListAllDone({ onSeeUpcoming }: Readonly<{ onSeeUpcoming?: () => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()
  const stateSize = useStateMascotSize()
  const mascotSize = stateSize
  const celebrating = useUIStore((state) => state.activeCelebration?.kind === 'all-done')
  return (
    <View testID="habit-list-all-done" style={styles.allDone}>
      <View testID="completed-day-mark" style={[styles.allDoneMark, { width: mascotSize, height: orbitMascotHeight(mascotSize) }]} importantForAccessibility="no-hide-descendants">
        <OrbitHop testID="completed-day-hop" active={celebrating}><OrbitMascot size={mascotSize} state="feliz" /></OrbitHop>
      </View>
      <View style={styles.allDoneText}>
        <Text style={[styles.allDoneTitle, { color: tokens.fg1 }]}>{t('habits.allDoneToday')}</Text>
        <Text style={[styles.allDoneHint, { color: tokens.fg2 }]}>{t('habits.allDoneHint')}</Text>
      </View>
      {onSeeUpcoming ? (
        <PillButton variant="ghost" size="sm" onClick={onSeeUpcoming}>
          {t('habits.seeUpcoming')}
        </PillButton>
      ) : null}
    </View>
  )
}

export function HabitListNothingOpen() {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()
  return <Text style={[styles.nothingOpen, { color: tokens.fg3 }]}>{t('habits.nothingOpen')}</Text>
}

export function HabitListFrequencyEmptyState({ frequencyUnit }: Readonly<{ frequencyUnit: HabitFrequencyFilter }>) {
  const { t } = useTranslation()
  const option = HABIT_FREQUENCY_FILTER_OPTIONS.find(({ value }) => value === frequencyUnit)!
  return <HabitListEmptyState
    title={t(option.labelKey)} description={t('habits.nothingOpen')}
    actionLabel={t('common.all')}
    onAction={() => useUIStore.getState().setFilters({ frequencyUnit: undefined })}
  />
}

const styles = StyleSheet.create({
  allDone: {
    alignItems: 'center',
    gap: 24,
    paddingVertical: SPACING.s48,
    paddingHorizontal: SPACING.s24,
  },
  allDoneMark: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDoneText: {
    alignItems: 'center',
    gap: 8,
  },
  allDoneTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 22,
    lineHeight: 26.4,
    letterSpacing: -0.44,
    textAlign: 'center',
  },
  allDoneHint: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  nothingOpen: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.s32,
    paddingVertical: SPACING.s64,
    gap: 16,
  },
  title: {
    fontFamily: 'Geist_500Medium',
    fontSize: 20,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Geist_400Regular',
    fontSize: 16,
    lineHeight: 24.8,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    marginTop: SPACING.s8,
    alignSelf: 'stretch',
    gap: 12,
  },
  linkAction: {
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACING.s4,
    paddingVertical: SPACING.s12,
    paddingHorizontal: SPACING.s8,
  },
  linkActionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})

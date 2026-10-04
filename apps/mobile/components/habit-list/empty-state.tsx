import { TOUCH_TARGET_MIN } from '@orbit/shared/theme'

import { ActionRow } from '@/components/ui/action-row'
import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { PillButton } from '@/components/ui/pill-button'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitListEmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
  askAstraLabel?: string
  onAskAstra?: () => void
  variant?: 'primary' | 'secondary'
}


export function HabitListEmptyState({
  title,
  description,
  actionLabel,
  onAction,
  askAstraLabel,
  onAskAstra,
  variant = 'primary',
}: Readonly<HabitListEmptyStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isAstraPrompt = variant === 'primary'
  const hasDistinctDescription = Boolean(description) && description !== title
  const showAstraAction =
    isAstraPrompt && Boolean(askAstraLabel) && Boolean(onAskAstra)
  const showActions =
    showAstraAction || (isAstraPrompt && Boolean(actionLabel))

  let emptyActions: ReactNode = null
  if (showActions) {
    emptyActions = (
      <View style={styles.actions}><ActionRow>
        {actionLabel ? (
          <PillButton
            variant="ghost"

            onClick={onAction}

          >
            {actionLabel}
          </PillButton>
        ) : null}
        {showAstraAction && askAstraLabel ? (
          <PillButton

            onClick={onAskAstra}

          >
            {askAstraLabel}
          </PillButton>
        ) : null}
      </ActionRow></View>
    )
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
      <OrbitMark size={96} />
      <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {hasDistinctDescription ? (
        <Text style={[styles.description, { color: tokens.fg2 }]}>{description}</Text>
      ) : null}
      {emptyActions}
    </View>
  )
}

export function HabitListAllDone({ onSeeUpcoming }: Readonly<{ onSeeUpcoming?: () => void }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()
  return (
    <View style={styles.allDone}>
      <Text style={[styles.allDoneTitle, { color: tokens.fg1 }]}>{t('habits.allDoneToday')}</Text>
      <Text style={[styles.allDoneHint, { color: tokens.fg2 }]}>{t('habits.allDoneHint')}</Text>
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

const styles = StyleSheet.create({
  allDone: {
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
  },
  allDoneTitle: {
    fontFamily: 'SpaceGrotesk_500Medium',
    fontSize: 20,
    letterSpacing: -0.2,
  },
  allDoneHint: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  nothingOpen: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
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
    marginTop: 8,
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
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  linkActionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
})

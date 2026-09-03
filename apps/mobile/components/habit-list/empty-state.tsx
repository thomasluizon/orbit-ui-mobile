import { type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { getHabitEmptyStateKey } from '@orbit/shared/utils'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
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

/**
 * InicioEmpty kit state: 104px satellite glyph, 22/500 title, 15 fg-2 body,
 * then a stacked full-width Astra pill + ghost create pill. Mirrors the web
 * habit-list empty state.
 */
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
  const showStackedActions =
    showAstraAction || (isAstraPrompt && Boolean(actionLabel))

  let emptyActions: ReactNode = null
  if (showStackedActions) {
    emptyActions = (
      <View style={styles.actions}>
        {showAstraAction && askAstraLabel ? (
          <PillButton

            onClick={onAskAstra}

          >
            {askAstraLabel}
          </PillButton>
        ) : null}
        {actionLabel ? (
          <PillButton
            variant="ghost"

            onClick={onAction}

          >
            {actionLabel}
          </PillButton>
        ) : null}
      </View>
    )
  } else if (actionLabel) {
    emptyActions = (
      <Pressable
        onPress={onAction}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={({ pressed }) => [styles.linkAction, { opacity: pressed ? 0.7 : 1 }]}
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
      <SatelliteGlyph size={104} />
      <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {hasDistinctDescription ? (
        <Text style={[styles.description, { color: tokens.fg2 }]}>{description}</Text>
      ) : null}
      {emptyActions}
    </View>
  )
}

// react-doctor-disable-next-line only-export-components -- co-located empty-state message helper dedicated to this module; Fast Refresh dev-only, no runtime effect https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function getEmptyHabitsMessage(
  view: 'today' | 'all' | 'general',
  t: (key: string) => string,
): string {
  return t(getHabitEmptyStateKey(view))
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
    gap: 16,
  },
  title: {
    fontFamily: 'Geist_500Medium',
    fontSize: 22,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Geist_400Regular',
    fontSize: 15,
    lineHeight: 22.5,
    textAlign: 'center',
    maxWidth: 300,
  },
  actions: {
    marginTop: 8,
    alignSelf: 'stretch',
    gap: 12,
  },
  linkAction: {
    marginTop: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  linkActionText: {
    fontFamily: 'Geist_500Medium',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})

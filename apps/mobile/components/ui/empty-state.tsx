import type { ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import type { LucideIcon } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface EmptyStateAction {
  label: string
  onPress?: () => void
  disabled?: boolean
  leading?: ReactNode
  variant?: 'primary' | 'secondary'
}

interface EmptyStateProps {
  title?: string
  description?: string
  /**
   * Swaps the Satellite glyph for a tonal icon disc. The Satellite is the empty half of the state
   * triad (DESIGN.md); every other centred state (locked, gated, no-data, load error) names its own
   * icon and shares this one lockup instead of hand-rolling it.
   */
  icon?: LucideIcon
  action?: EmptyStateAction
  /** Rendered under the action, on the same centred rhythm: an inline error, a hint, or a second CTA. */
  footer?: ReactNode
  style?: StyleProp<ViewStyle>
}

/**
 * The one centred state lockup: Satellite glyph or tonal icon disc, optional title, body copy at a
 * readable measure, an optional hugging CTA, and an optional footer slot. Every empty, locked,
 * gated, no-data and load-error surface on both platforms renders through this.
 */
export function EmptyState({
  title,
  description,
  icon: Icon,
  action,
  footer,
  style,
}: Readonly<EmptyStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={[styles.container, style]} testID={Icon ? 'empty-state-icon' : 'empty-state-satellite'}>
      {Icon ? (
        <View style={[styles.iconDisc, { backgroundColor: tokens.bgField }]}>
          <Icon size={28} strokeWidth={1.4} color={tokens.fg3} />
        </View>
      ) : (
        <SatelliteGlyph size={96} />
      )}

      <View style={styles.copy}>
        {title ? <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text> : null}
        {description ? (
          <Text style={[styles.description, { color: tokens.fg2 }]}>{description}</Text>
        ) : null}
      </View>

      {action || footer ? (
        <View style={styles.actions}>
          {action ? (
            <PillButton
              variant={action.variant === 'secondary' ? 'ghost' : 'primary'}
              onPress={action.onPress}
              disabled={action.disabled}
              leading={action.leading}
              accessibilityLabel={action.label}
            >
              {action.label}
            </PillButton>
          ) : null}
          {footer}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 20,
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  iconDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 22,
    lineHeight: 29,
    letterSpacing: -0.22,
    maxWidth: 300,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 22,
    maxWidth: 320,
    textAlign: 'center',
  },
  actions: {
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
})

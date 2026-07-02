import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface EmptyStateAction {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
}

interface EmptyStateProps {
  title?: string
  description: string
  action?: EmptyStateAction
  style?: StyleProp<ViewStyle>
}

/** Kit empty state: satellite glyph, optional title, body copy, and optional pill CTA. */
export function EmptyState({
  title,
  description,
  action,
  style,
}: Readonly<EmptyStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={[styles.container, style]}>
      <SatelliteGlyph size={96} />
      {title ? <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text> : null}
      <Text
        style={[
          styles.description,
          { color: tokens.fg3 },
          title ? null : styles.descriptionWithoutTitle,
        ]}
      >
        {description}
      </Text>
      {action ? (
        action.variant === 'secondary' ? (
          <Pressable
            onPress={action.onPress}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            hitSlop={{ top: 8, bottom: 8 }}
            style={({ pressed }) => [styles.secondaryAction, pressed ? styles.pressed : null]}
          >
            <Text style={[styles.secondaryActionText, { color: tokens.primary }]}>
              {action.label}
            </Text>
          </Pressable>
        ) : (
          <PillButton onPress={action.onPress} style={styles.primaryAction}>
            {action.label}
          </PillButton>
        )
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 20,
    marginTop: 18,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 6,
    maxWidth: 280,
    textAlign: 'center',
  },
  descriptionWithoutTitle: {
    marginTop: 14,
  },
  primaryAction: {
    marginTop: 22,
  },
  secondaryAction: {
    marginTop: 22,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  secondaryActionText: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
})

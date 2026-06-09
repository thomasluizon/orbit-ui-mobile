import { useMemo } from 'react'
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface EmptyStateAction {
  label: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
}

interface EmptyStateProps {
  icon: LucideIcon
  iconVariant?: 'default' | 'success'
  title?: string
  description: string
  action?: EmptyStateAction
  style?: StyleProp<ViewStyle>
}

/** v8 empty state: centered icon disc, optional title, description, and optional action. */
export function EmptyState({
  icon: Icon,
  iconVariant = 'default',
  title,
  description,
  action,
  style,
}: Readonly<EmptyStateProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  const isSuccess = iconVariant === 'success'
  const discColor = isSuccess ? `${tokens.statusDone}1A` : tokens.bgSunk
  const discBorder = isSuccess ? `${tokens.statusDone}33` : tokens.hairline
  const iconColor = isSuccess ? tokens.statusDone : tokens.fg3

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.disc, { backgroundColor: discColor, borderColor: discBorder }]}>
        <Icon size={32} color={iconColor} strokeWidth={1.6} />
      </View>
      {title ? <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text> : null}
      <Text style={[styles.description, { color: tokens.fg3 }]}>{description}</Text>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({ pressed }) => [
            styles.action,
            action.variant === 'secondary'
              ? { backgroundColor: 'transparent' }
              : { backgroundColor: tokens.primary },
            pressed ? { opacity: 0.85 } : null,
          ]}
        >
          <Text
            style={[
              styles.actionText,
              { color: action.variant === 'secondary' ? tokens.primary : tokens.fgOnPrimary },
            ]}
          >
            {action.label}
          </Text>
        </Pressable>
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
  disc: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Geist',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 16,
    textAlign: 'center',
  },
  description: {
    fontFamily: 'Geist',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: 240,
    textAlign: 'center',
  },
  action: {
    marginTop: 20,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  actionText: {
    fontFamily: 'Geist',
    fontSize: 12,
    fontWeight: '600',
  },
})

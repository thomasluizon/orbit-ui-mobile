import type { ComponentType, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronLeft, type LucideProps } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type LucideIcon = ComponentType<LucideProps>

interface AppBarProps {
  /** Show a back chevron in the leading slot. Takes precedence over `LeadingIcon`. */
  back?: boolean
  /** Callback for the back / leading button. */
  onBack?: () => void
  /** Leading lucide-react-native icon (ignored when `back` is true). */
  LeadingIcon?: LucideIcon
  title: string
  subtitle?: string
  /** Right-side cluster (typically icon buttons / streak badge). */
  trailing?: ReactNode
  /** Bottom hairline divider (default true). */
  hairline?: boolean
  /** Accessibility label for the leading button. Defaults to t('common.back'). */
  backLabel?: string
}

/** v8 compact 52px app bar: leading button · title (+ optional subtitle) · trailing cluster. */
export function AppBar({
  back = false,
  onBack,
  LeadingIcon,
  title,
  subtitle,
  trailing,
  hairline = true,
  backLabel,
}: Readonly<AppBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()
  const resolvedBackLabel = backLabel ?? t('common.back')

  return (
    <View
      style={[
        styles.row,
        {
          borderBottomColor: hairline ? tokens.hairline : 'transparent',
          borderBottomWidth: hairline ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      <Pressable
        onPress={onBack}
        disabled={!back && !LeadingIcon}
        accessibilityRole={back || LeadingIcon ? 'button' : 'none'}
        accessibilityLabel={resolvedBackLabel}
        style={styles.iconBtn}
      >
        {back ? (
          <ChevronLeft size={18} color={tokens.fg2} strokeWidth={1.7} />
        ) : LeadingIcon ? (
          <LeadingIcon size={17} color={tokens.fg2} strokeWidth={1.5} />
        ) : (
          <View style={styles.iconPlaceholder} />
        )}
      </Pressable>

      <View style={styles.titleColumn}>
        <Text
          style={[styles.title, { color: tokens.fg1 }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[styles.subtitle, { color: tokens.fg3 }]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    paddingLeft: 8,
    paddingRight: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPlaceholder: {
    width: 18,
    height: 18,
  },
  titleColumn: {
    flex: 1,
    minWidth: 0,
    gap: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Geist',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.17,
    lineHeight: 20,
  },
  subtitle: {
    fontFamily: 'GeistMono',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.44,
    fontVariant: ['tabular-nums'],
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
})

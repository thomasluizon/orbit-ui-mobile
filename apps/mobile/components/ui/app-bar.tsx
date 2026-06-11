import type { ComponentType, ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import {
  ChevronLeft,
  HelpCircle,
  Share2,
  X,
  type LucideProps,
} from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type LucideIcon = ComponentType<LucideProps>

type AppBarRightVariant = 'help' | 'close' | 'share'

interface AppBarProps {
  /** Show a back chevron in the leading slot. Takes precedence over `LeadingIcon`. */
  back?: boolean
  /** Callback for the back / leading button. */
  onBack?: () => void
  /** Leading lucide-react-native icon (ignored when `back` is true). */
  LeadingIcon?: LucideIcon
  title: string
  subtitle?: string
  /** Arbitrary right-slot cluster; takes precedence over `right`. */
  trailing?: ReactNode
  /** Standard right-slot action: help (ringed), close, or share. */
  right?: AppBarRightVariant
  onRight?: () => void
  /** Accessibility label for the `right` action. Defaults to the matching common.* key. */
  rightLabel?: string
  /** Accessibility label for the leading button. Defaults to t('common.back'). */
  backLabel?: string
}

/** Kit NavHeader: 56px transparent bar — equal flexible side slots (min 40px)
 *  keep the uppercase title truly centered regardless of trailing cluster width. */
export function AppBar({
  back = false,
  onBack,
  LeadingIcon,
  title,
  subtitle,
  trailing,
  right,
  onRight,
  rightLabel,
  backLabel,
}: Readonly<AppBarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { t } = useTranslation()
  const resolvedBackLabel = backLabel ?? t('common.back')

  const rightAction = right ? (
    <Pressable
      onPress={onRight}
      accessibilityRole="button"
      accessibilityLabel={
        rightLabel ??
        (right === 'help'
          ? t('common.help')
          : right === 'close'
            ? t('common.close')
            : t('common.share'))
      }
      style={({ pressed }) => [
        styles.iconBtn,
        right === 'help'
          ? { borderWidth: 1.5, borderColor: tokens.hairlineStrong }
          : null,
        pressed
          ? [styles.iconBtnPressed, { backgroundColor: tokens.bgElev }]
          : null,
      ]}
    >
      {right === 'help' ? (
        <HelpCircle size={22} color={tokens.fg1} strokeWidth={1.8} />
      ) : right === 'close' ? (
        <X size={24} color={tokens.fg1} strokeWidth={1.8} />
      ) : (
        <Share2 size={21} color={tokens.fg1} strokeWidth={1.8} />
      )}
    </Pressable>
  ) : null

  return (
    <View style={styles.row}>
      <View style={styles.leadingSlot}>
        {back || LeadingIcon ? (
          <Pressable
            onPress={onBack}
            disabled={!onBack}
            accessibilityRole={onBack ? 'button' : 'none'}
            accessibilityLabel={resolvedBackLabel}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed
                ? [styles.iconBtnPressed, { backgroundColor: tokens.bgElev }]
                : null,
            ]}
          >
            {back ? (
              <ChevronLeft size={26} color={tokens.fg1} strokeWidth={2} />
            ) : LeadingIcon ? (
              <LeadingIcon size={22} color={tokens.fg1} strokeWidth={1.8} />
            ) : null}
          </Pressable>
        ) : null}
      </View>

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

      <View style={styles.trailingSlot}>{trailing ?? rightAction}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 56,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  leadingSlot: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 40,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    flexShrink: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    transform: [{ scale: 0.92 }],
  },
  titleColumn: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 13,
    letterSpacing: 1.17,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 12,
    letterSpacing: 0.24,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  trailingSlot: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    flexShrink: 0,
  },
})

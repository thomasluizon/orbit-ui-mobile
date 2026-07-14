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

type AppBarTokens = ReturnType<typeof createTokensV2>

// react-doctor-disable-next-line only-export-components -- co-located label-resolver helper dedicated to this bar; Fast Refresh dev-only, no runtime effect https://github.com/thomasluizon/orbit-ui-mobile/issues/243
export function resolveAppBarRightActionLabel(
  right: AppBarRightVariant | undefined,
  rightLabel: string | undefined,
  t: (key: string) => string,
): string | undefined {
  if (!right) return undefined
  if (rightLabel) return rightLabel
  if (right === 'help') return t('common.help')
  if (right === 'close') return t('common.close')
  return t('common.share')
}

interface AppBarRightActionProps {
  right: AppBarRightVariant
  rightLabel?: string
  onRight?: () => void
  tokens: AppBarTokens
  t: (key: string) => string
}

function AppBarRightAction({
  right,
  rightLabel,
  onRight,
  tokens,
  t,
}: Readonly<AppBarRightActionProps>) {
  let rightIcon: ReactNode
  if (right === 'help') rightIcon = <HelpCircle size={22} color={tokens.fg1} strokeWidth={1.8} />
  else if (right === 'close') rightIcon = <X size={24} color={tokens.fg1} strokeWidth={1.8} />
  else rightIcon = <Share2 size={21} color={tokens.fg1} strokeWidth={1.8} />

  return (
    <Pressable
      onPress={onRight}
      hitSlop={2}
      accessibilityRole="button"
      accessibilityLabel={resolveAppBarRightActionLabel(right, rightLabel, t)}
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
      {rightIcon}
    </Pressable>
  )
}

interface AppBarLeadingProps {
  back: boolean
  LeadingIcon?: LucideIcon
  onBack?: () => void
  resolvedBackLabel: string
  tokens: AppBarTokens
}

function AppBarLeading({
  back,
  LeadingIcon,
  onBack,
  resolvedBackLabel,
  tokens,
}: Readonly<AppBarLeadingProps>) {
  if (!back && !LeadingIcon) return null

  let leadingIcon: ReactNode = null
  if (back) leadingIcon = <ChevronLeft size={26} color={tokens.fg1} strokeWidth={2} />
  else if (LeadingIcon)
    leadingIcon = <LeadingIcon size={22} color={tokens.fg1} strokeWidth={1.8} />

  return (
    <Pressable
      onPress={onBack}
      disabled={!onBack}
      hitSlop={2}
      accessibilityRole={onBack ? 'button' : 'none'}
      accessibilityLabel={resolvedBackLabel}
      style={({ pressed }) => [
        styles.iconBtn,
        pressed
          ? [styles.iconBtnPressed, { backgroundColor: tokens.bgElev }]
          : null,
      ]}
    >
      {leadingIcon}
    </Pressable>
  )
}

interface AppBarProps {
  /** Show a back chevron in the leading slot. Takes precedence over `LeadingIcon`. */
  back?: boolean
  /** Callback for the back / leading button. */
  onBack?: () => void
  /** Leading lucide-react-native icon (ignored when `back` is true). */
  LeadingIcon?: LucideIcon
  /** Mark rendered immediately before the centered title (e.g. Astra's avatar). */
  titleIcon?: ReactNode
  /** Centered uppercase label. Omit for bars whose content carries its own heading. */
  title?: string
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
  titleIcon,
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
    <AppBarRightAction
      right={right}
      rightLabel={rightLabel}
      onRight={onRight}
      tokens={tokens}
      t={t}
    />
  ) : null

  return (
    <View style={styles.row}>
      <View style={styles.leadingSlot}>
        <AppBarLeading
          back={back}
          LeadingIcon={LeadingIcon}
          onBack={onBack}
          resolvedBackLabel={resolvedBackLabel}
          tokens={tokens}
        />
      </View>

      {title || titleIcon ? (
        <View style={styles.titleColumn}>
          <View style={styles.titleRow}>
            {titleIcon}
            {title ? (
              <Text
                style={[styles.title, { color: tokens.fg1 }]}
                numberOfLines={1}
              >
                {title}
              </Text>
            ) : null}
          </View>
          {subtitle ? (
            <Text
              style={[styles.subtitle, { color: tokens.fg3 }]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}

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
    transform: [{ scale: 0.96 }],
  },
  titleColumn: {
    flexShrink: 1,
    minWidth: 0,
    gap: 2,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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

import { resolveSettingsRowText } from '@orbit/shared/hooks'
import { useState, type ComponentType, type ReactNode } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { InsetFocusPressable as Pressable } from './inset-focus-pressable'
import { ChevronRight, type IconProps } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

type IconComponent = ComponentType<IconProps>

interface SettingsRowProps {
  label: string
  textMode?: 'label' | 'personal'
  /** Secondary line under the label (Geist Sans 14 fg-3). */
  desc?: string
  /** Optional right-side value text. */
  value?: string
  /** Override color for the value text. Defaults to fg3. */
  valueColor?: string
  /** Trailing accessory; `'chevron'` is default, `'none'` hides it. */
  accessory?: 'chevron' | 'none'
  onPress?: () => void
  /** Render the value in mono with tabular nums (counts, dates). */
  mono?: boolean
  /** Small leading dot (status color or scheme swatch). */
  leadingDot?: string
  /** Leading Tabler icon, rendered 24/1.5 centered in a 28px slot. */
  icon?: IconComponent
  /** Destructive row: the icon uses the graphic role and the title uses the text role. */
  danger?: boolean
  /** Slot rendered between the value and the chevron (e.g. Switch, ProTag). */
  children?: ReactNode
  /** Hairline rule below the row; disable when helper text follows. */
  divider?: boolean
}

/**
 * Kit ListRow: flat hairline-separated row used in profile / settings / about.
 * Composed: leading icon/dot · title (+ desc) · value (optional) · trailing slot · chevron.
 */
function SettingsRowTrailing({ value, children, accessory, valueColor, mono, tokens }: Readonly<Pick<SettingsRowProps, 'value' | 'children' | 'accessory' | 'valueColor' | 'mono'> & { tokens: ReturnType<typeof createTokensV2> }>) {
  return <>
      {(value || children || accessory === 'chevron') ? <View style={styles.trailingBlock}>
        {value ? (
          <Text
            style={[
              mono ? styles.valueMono : styles.value,
              { color: valueColor ?? tokens.fg2 },
            ]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {children}
        {accessory === 'chevron' ? (
          <ChevronRight size={24} color={tokens.fg3} strokeWidth={1.8} />
        ) : null}
      </View> : null}
  </>
}

function labelPresentation(textMode: SettingsRowProps['textMode'], expanded: boolean) {
  return { numberOfLines: textMode === 'personal' && !expanded ? 2 : undefined, style: textMode === 'label' || expanded ? styles.wrappedLabel : null }
}

export function SettingsRow({
  label,
  textMode = 'label',
  desc,
  value,
  valueColor,
  accessory = 'chevron',
  onPress,
  mono = false,
  leadingDot,
  icon: LeadingIcon,
  danger = false,
  children,
  divider = true,
}: Readonly<SettingsRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { fontScale } = useWindowDimensions()
  const [expanded, setExpanded] = useState(false)
  const { expandedState, onAction: handlePress } = resolveSettingsRowText({ textMode, expanded, onAction: onPress, onToggle: () => setExpanded((current) => !current) })
  const rowColors = { iconColor: danger ? tokens.statusBad : tokens.fg1 }
  const titleColor = danger ? tokens.statusBadText : tokens.fg1

  return (
    <Pressable
      focusOffset={-6}
      onPress={handlePress}
      disabled={!handlePress}
      accessibilityRole={handlePress ? 'button' : 'none'}
      accessibilityState={expandedState === undefined ? undefined : { expanded: expandedState }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        textMode === 'label' && fontScale > 1.3 ? styles.largeTextRow : null,
        textMode === 'personal' ? styles.personalRow : null,
        {
          backgroundColor:
            pressed && handlePress ? tokens.bgHover : 'transparent',
          borderBottomColor: tokens.hairline,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
        },
      ]}
    >
      {LeadingIcon ? (
        <View style={styles.iconSlot}>
          <LeadingIcon size={24} color={rowColors.iconColor} strokeWidth={1.5} />
        </View>
      ) : null}
      {leadingDot ? (
        <View style={[styles.dot, { backgroundColor: leadingDot }]} />
      ) : null}
      <View style={[styles.titleBlock, textMode === 'personal' ? styles.personalTextBlock : null]}>
        <Text
          style={[styles.title, labelPresentation(textMode, expanded).style, { color: titleColor }]}
          numberOfLines={labelPresentation(textMode, expanded).numberOfLines}
          ellipsizeMode="tail"
        >
          {label}
        </Text>
        {desc ? (
          <Text style={[styles.desc, { color: tokens.fg2 }]}>{desc}</Text>
        ) : null}
      </View>
      <SettingsRowTrailing value={value} valueColor={valueColor} accessory={accessory} mono={mono} tokens={tokens}>{children}</SettingsRowTrailing>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  largeTextRow: { alignItems: 'flex-start' },
  personalRow: { flexDirection: 'column', alignItems: 'stretch' },
  personalTextBlock: { flex: 0, width: '100%' },
  wrappedLabel: { lineHeight: 23.8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 48,
    borderRadius: 12,
    overflow: 'hidden',
  },
  iconSlot: {
    width: 28,
    alignItems: 'center',
    flexShrink: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontFamily: 'Geist_400Regular',
    fontSize: 17,
    lineHeight: 22.95,
  },
  desc: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 19.6,
  },
  trailingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  value: {
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    maxWidth: 220,
  },
  valueMono: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    maxWidth: 220,
  },
})

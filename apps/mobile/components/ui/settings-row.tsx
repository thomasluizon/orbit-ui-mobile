import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
// react-doctor-disable-next-line rn-prefer-reanimated -- RN Animated with useNativeDriver drives the switch thumb translateX on the UI thread already; Reanimated 4.x migration deferred (worklets 0.10.0 ABI-pinned to the SDK 57 set, needs on-device QA) https://github.com/thomasluizon/orbit-ui-mobile/issues/243
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native'
import { ChevronRight, type LucideProps } from '@/components/ui/icons'
import { createTokensV2, easings, type AppTokensV2 } from '@/lib/theme'
import { toAnimatedEasing } from '@/lib/motion'
import { useAppTheme } from '@/lib/use-app-theme'

type LucideIcon = ComponentType<LucideProps>

interface SettingsRowProps {
  label: string
  /** Secondary line under the label (Rubik 14 fg-3). */
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
  /** Leading icon, rendered 22/1.8 centered in a 26px slot. */
  icon?: LucideIcon
  /** Destructive row: title and icon render in status-bad. */
  danger?: boolean
  /** Slot rendered between the value and the chevron (e.g. Switch, ProTag). */
  children?: ReactNode
}

/**
 * Kit ListRow: flat row used in profile / settings / about. Draws no rule of its own;
 * wrap rows in `SettingsGroup` when adjacent rows earn a hairline between them.
 * Composed: leading icon/dot · title (+ desc) · value (optional) · trailing slot · chevron.
 */
export function SettingsRow({
  label,
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
}: Readonly<SettingsRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const titleColor = danger ? tokens.statusBad : tokens.fg1

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'none'}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor:
            pressed && onPress ? tokens.bgElevPressed : 'transparent',
        },
      ]}
    >
      {LeadingIcon ? (
        <View style={styles.iconSlot}>
          <LeadingIcon size={22} color={titleColor} strokeWidth={1.8} />
        </View>
      ) : null}
      {leadingDot ? (
        <View style={[styles.dot, { backgroundColor: leadingDot }]} />
      ) : null}
      <View style={styles.titleBlock}>
        <Text
          style={[styles.title, { color: titleColor }]}
          numberOfLines={2}
        >
          {label}
        </Text>
        {desc ? (
          <Text style={[styles.desc, { color: tokens.fg3 }]}>{desc}</Text>
        ) : null}
      </View>
      <View style={styles.trailingBlock}>
        {value ? (
          <Text
            style={[
              mono ? styles.valueMono : styles.value,
              { color: valueColor ?? tokens.fg3 },
            ]}
            numberOfLines={2}
          >
            {value}
          </Text>
        ) : null}
        {children}
        {accessory === 'chevron' ? (
          <ChevronRight size={22} color={tokens.fg4} strokeWidth={1.8} />
        ) : null}
      </View>
    </Pressable>
  )
}

const SWITCH_THUMB_TRAVEL = 20

function switchTrackOffColor(appTokens: AppTokensV2): string {
  const normalized = appTokens.fg1.replace('#', '')
  const red = Number.parseInt(normalized.slice(0, 2), 16)
  const green = Number.parseInt(normalized.slice(2, 4), 16)
  const blue = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${red}, ${green}, ${blue}, 0.16)`
}

interface SwitchProps {
  on: boolean
  onToggle: () => void
  accessibilityLabel: string
  disabled?: boolean
}

/** Kit Switch: 48×28 pill, 22px thumb; primary track when on, fg-1 alpha track when off. */
export function Switch({
  on,
  onToggle,
  accessibilityLabel,
  disabled = false,
}: Readonly<SwitchProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const [thumbProgress] = useState(() => new Animated.Value(on ? 1 : 0))

  useEffect(() => {
    Animated.timing(thumbProgress, {
      toValue: on ? 1 : 0,
      duration: 220,
      easing: toAnimatedEasing(easings.smooth),
      useNativeDriver: true,
    }).start()
  }, [on, thumbProgress])

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: on, disabled }}
      disabled={disabled}
      onPress={onToggle}
      hitSlop={{ top: 8, bottom: 8 }}
      style={[
        styles.switchTrack,
        {
          backgroundColor: on
            ? tokens.primary
            : switchTrackOffColor(tokens),
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Animated.View
        style={[
          styles.switchThumb,
          {
            backgroundColor: tokens.fgOnPrimary,
            transform: [
              {
                translateX: thumbProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, SWITCH_THUMB_TRAVEL],
                }),
              },
            ],
          },
        ]}
      />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  iconSlot: {
    width: 26,
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
    fontFamily: 'Rubik_400Regular',
    fontSize: 18,
    lineHeight: 22.5,
  },
  desc: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    lineHeight: 18.9,
  },
  trailingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  value: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    maxWidth: 220,
    textAlign: 'right',
  },
  valueMono: {
    fontFamily: 'Roboto_400Regular',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    maxWidth: 220,
    textAlign: 'right',
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 999,
    padding: 3,
    justifyContent: 'center',
    flexShrink: 0,
  },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 999,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.20)',
  },
})

import type { ReactNode } from 'react'
import { SPACING, TOUCH_TARGET_MIN, typeRoles } from '@orbit/shared/theme'
import { StyleSheet, Text, View } from 'react-native'
import { PressScalePressable as Pressable } from '@/components/motion/press-scale'
import { createTokensV2, radius, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface ChipProps {
  children: ReactNode
  active?: boolean
  onPress?: () => void
  leading?: ReactNode
  /** Accessibility label override. Defaults to the chip text content. */
  accessibilityLabel?: string
  variant?: 'default' | 'period'
}

/** Kit pill chip: bg-elev well with a hairline ring; active fills selection-bg
 *  with a primary ring and primary text. */
export function Chip({
  children,
  active = false,
  onPress,
  leading,
  accessibilityLabel,
  variant = 'default',
}: Readonly<ChipProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const isPeriod = variant === 'period'

  return (
    <Pressable
      selectionRingWidth={active && isPeriod ? 1.5 : 1}
      selectionRingColor={isPeriod ? tokens.primary : tintFromPrimary(tokens, 0.45)}
      selectionRingRestColor={tokens.hairline}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => {
        const restingBackground = isPeriod ? tokens.bgWell : tokens.bgElev
        const selectedBackground = isPeriod ? tokens.primaryDim : tokens.selectionBg
        const pressedBackground = pressed ? tokens.bgHover : restingBackground
        return [
          styles.chip,
          {
            backgroundColor: active ? pressed ? tokens.bgHover : selectedBackground : pressedBackground,
          },
        ]
      }}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <Text
        style={[styles.label, isPeriod ? styles.periodLabel : null, { color: active ? tokens.fg1 : tokens.fg2 }]}
        numberOfLines={1}
      >
        {children}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  chip: {
    minHeight: TOUCH_TARGET_MIN,
    minWidth: TOUCH_TARGET_MIN,
    paddingVertical: SPACING.s8,
    paddingHorizontal: SPACING.s16,
    borderRadius: radius.full,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leading: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Geist_500Medium',
    fontSize: 14,
  },
  periodLabel: {
    fontSize: typeRoles.secondary.size,
  },
})

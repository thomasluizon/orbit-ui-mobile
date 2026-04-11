import type { ReactNode } from 'react'
import { StyleSheet, TouchableOpacity, View, type ViewStyle } from 'react-native'
import type { HabitCardStatus } from '@orbit/shared/utils'
import { useAppTheme } from '@/lib/use-app-theme'

interface HabitCardShellProps {
  accentBar: string
  status: HabitCardStatus
  isSelected?: boolean
  isChild?: boolean
  depth?: number
  dimmed?: boolean
  justCompleted?: boolean
  onPress?: () => void
  onLongPress?: () => void
  children: ReactNode
  accessibilityLabel?: string
}

export function HabitCardShell({
  accentBar,
  status,
  isSelected,
  isChild,
  depth = 0,
  dimmed,
  onPress,
  onLongPress,
  children,
  accessibilityLabel,
}: Readonly<HabitCardShellProps>) {
  const { colors, radius, shadows } = useAppTheme()

  const barColor = status === 'completed' ? `${accentBar}4D` : accentBar

  const containerStyle: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: isChild ? radius.lg : radius.xl,
    borderWidth: 1,
    borderColor: isSelected ? colors.primary : colors.border,
    padding: isChild ? 10 : 14,
    paddingLeft: isChild ? 14 : 18,
    marginLeft: isChild ? depth * 20 : 0,
    marginBottom: 8,
    opacity: dimmed ? 0.4 : 1,
    ...(isChild ? {} : shadows.md),
  }

  const Wrapper = onPress ? TouchableOpacity : View
  const wrapperProps = onPress
    ? {
        onPress,
        onLongPress,
        delayLongPress: 300,
        activeOpacity: 0.85,
        accessibilityLabel,
      }
    : { accessibilityLabel }

  return (
    <Wrapper style={containerStyle} {...wrapperProps}>
      {!isSelected && (
        <View
          pointerEvents="none"
          style={[
            styles.accentBar,
            {
              backgroundColor: barColor,
              borderTopLeftRadius: isChild ? radius.lg : radius.xl,
              borderBottomLeftRadius: isChild ? radius.lg : radius.xl,
            },
          ]}
        />
      )}
      {children}
    </Wrapper>
  )
}

const styles = StyleSheet.create({
  accentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
})

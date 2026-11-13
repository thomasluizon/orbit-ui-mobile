import type { FabProps } from '@orbit/shared/contracts/actions'
import { FAB_SIZE } from '@orbit/shared/theme'
import { StyleSheet, type PressableProps } from 'react-native'
import { useMemo } from 'react'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { MotionPressable } from '@/components/ui/motion-pressable'

export function Fab({ label, children, onClick, ...buttonProps }: Readonly<FabProps & Omit<PressableProps, 'children' | 'onPress' | 'style'>>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  return (
    <MotionPressable
      {...buttonProps}
      onPress={onClick}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={buttonProps.testID ?? 'fab'}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: pressed ? tokens.primaryPressed : tokens.primary,
          boxShadow: `0 0 0 6px ${tokens.bg}`,
        },
      ]}
    >
      {children}
    </MotionPressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
})

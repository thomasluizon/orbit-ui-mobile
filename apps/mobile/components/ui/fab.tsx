import type { FabProps } from '@orbit/shared/contracts/actions'
import { FAB_SIZE } from '@orbit/shared/theme'
import { StyleSheet, View, type PressableProps } from 'react-native'
import { useMemo } from 'react'
import { createTokensV2, shadowsV2, type AppShadowV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { MotionPressable } from '@/components/ui/motion-pressable'

function dropShadow({ shadowOffset, shadowRadius, shadowOpacity }: AppShadowV2) {
  return `${shadowOffset.width}px ${shadowOffset.height}px ${shadowRadius}px rgba(0, 0, 0, ${shadowOpacity})`
}

export function Fab({ label, children, onClick, neutral = false, ...buttonProps }: Readonly<FabProps & Omit<PressableProps, 'children' | 'onPress' | 'style'> & { neutral?: boolean }>) {
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
          backgroundColor: neutral ? tokens.bgElev : pressed ? tokens.primaryPressed : tokens.primary,
          boxShadow: neutral
            ? `inset 0 0 0 1px ${tokens.hairlineStrong}, ${dropShadow(shadowsV2.shadow2)}`
            : `0 0 0 6px ${tokens.bg}`,
        },
      ]}
    >
      {({ pressed }) => (
        <>
          {neutral ? <View pointerEvents="none" testID="fab-press-fill" style={[styles.pressFill, { backgroundColor: pressed ? tokens.bgHoverOpaque : 'transparent' }]} /> : null}
          {children}
        </>
      )}
    </MotionPressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressFill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 999,
  },
})

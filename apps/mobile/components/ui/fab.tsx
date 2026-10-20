import type { FabProps } from '@orbit/shared/contracts/actions'
import { Pressable, StyleSheet } from 'react-native'
import { useMemo } from 'react'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function Fab({ label, children, onClick }: Readonly<FabProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )

  return (
    <Pressable
      onPress={onClick}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="fab"
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: tokens.primary,
          boxShadow: `0 0 0 6px ${tokens.bg}`,
        },
        pressed ? styles.pressed : null,
      ]}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    width: 60,
    height: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
})

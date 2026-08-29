import type { SwitchProps } from '@orbit/shared/contracts/forms'
import { Pressable, StyleSheet, View } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function Switch({ label, checked, onChange }: Readonly<SwitchProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={() => onChange(!checked)}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      data-checked={checked ? '' : undefined}
      style={styles.control}
    >
      <View
        style={[
          styles.track,
          { backgroundColor: checked ? tokens.primary : tokens.fg4 },
        ]}
      >
        <View
          style={[
            styles.thumb,
            { backgroundColor: tokens.fgOnPrimary, transform: [{ translateX: checked ? 23 : 3 }] },
          ]}
        />
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  control: { minHeight: 44, justifyContent: 'center' },
  track: { width: 48, height: 28, borderRadius: 14, justifyContent: 'center' },
  thumb: { width: 22, height: 22, borderRadius: 11 },
})

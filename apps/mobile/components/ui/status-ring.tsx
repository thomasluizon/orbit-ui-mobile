import type { StatusRingProps } from '@orbit/shared/contracts/lists'
import { StyleSheet, View } from 'react-native'
import { Check } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function StatusRing({
  status = 'empty',
  size = 30,
  label,
}: Readonly<StatusRingProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const color = {
    empty: tokens.fg4,
    done: tokens.fg1,
    overdue: tokens.statusOverdue,
    bad: tokens.statusBad,
  }[status]
  const done = status === 'done'

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={label}
      accessibilityState={{ disabled: false }}
      testID="status-ring"
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: done ? color : 'transparent',
          borderColor: done ? 'transparent' : color,
          borderWidth: done ? 0 : 2,
        },
      ]}
    >
      {done ? (
        <Check
          size={Math.round(size * 0.57)}
          strokeWidth={3}
          color={tokens.bg}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
})

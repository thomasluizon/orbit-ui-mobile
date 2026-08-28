import type { StepUpProps } from '@orbit/shared/contracts/overlay'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui/pill-button'
import { Shield } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function StepUp({ message, actionLabel, onAction, busy = false }: Readonly<StepUpProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={[styles.root, { backgroundColor: tokens.bgElev }]}>
      <Shield color={tokens.fg2} size={20} strokeWidth={1.8} />
      <Text style={[styles.message, { color: tokens.fg2 }]}>{message}</Text>
      <Button loading={busy} onClick={onAction} size="sm" variant="secondary">
        {actionLabel}
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  message: {
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 20,
  },
})

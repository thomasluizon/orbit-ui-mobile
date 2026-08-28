import { StyleSheet, Text, View } from 'react-native'
import { Shield } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function CapacityNotice({ message }: Readonly<{ message: string }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={[styles.root, { backgroundColor: tokens.bgWell }]}>
      <Shield size={20} strokeWidth={1.5} color={tokens.fg2} />
      <Text style={[styles.message, { color: tokens.fg2 }]}>{message}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'flex-start',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  message: {
    flex: 1,
    fontFamily: 'Geist_400Regular',
    fontSize: 14,
    lineHeight: 22,
  },
})

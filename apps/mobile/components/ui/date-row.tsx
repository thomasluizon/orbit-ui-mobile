import type { DateRowProps } from '@orbit/shared/contracts/forms'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'

export function DateRow({ label, value, note }: Readonly<DateRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.root} accessible={false}>
      <Text style={[styles.label, { color: tokens.fg2 }]}>{label}</Text>
      <Text style={[styles.value, { color: tokens.fg1 }]}>{value}</Text>
      {note ? <Text style={[styles.note, { color: tokens.fg3 }]}>{note}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { width: '100%', gap: 4, paddingHorizontal: 16, paddingVertical: 12 },
  label: { fontFamily: 'Rubik_500Medium', fontSize: 14 },
  value: { fontFamily: 'Roboto_400Regular', fontSize: 16, fontVariant: ['tabular-nums'] },
  note: { fontFamily: 'Rubik_400Regular', fontSize: 14 },
})

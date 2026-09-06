import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function CommandKeyHints({ back }: Readonly<{ back: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const hints = [
    ['↑↓', t('command.hints.navigate')],
    ['↵', t('command.hints.select')],
    ['Esc', t(back ? 'command.hints.back' : 'command.hints.close')],
  ]
  return <View style={[styles.footer, { borderColor: tokens.hairline }]}>{hints.map(([key, label]) => <View key={key} style={styles.hint}>
    <Text style={[styles.key, { color: tokens.fg3, borderColor: tokens.hairline }]}>{key}</Text>
    <Text style={[styles.label, { color: tokens.fg4 }]}>{label}</Text>
  </View>)}</View>
}

const styles = StyleSheet.create({
  footer: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, padding: 16, borderTopWidth: 1 },
  hint: { flexDirection: 'row', gap: 4, alignItems: 'center' }, key: { fontFamily: 'GeistMono_400Regular', fontSize: 12, paddingHorizontal: 4, borderRadius: radius.sm, borderWidth: 1 },
  label: { fontFamily: 'GeistMono_400Regular', fontSize: 12 },
})

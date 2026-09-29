import type { PageHeaderProps } from '@orbit/shared/contracts/navigation'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { ArrowLeft } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PageHeader({ title, backLabel, onBack, action, footer }: Readonly<PageHeaderProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View style={{ borderBottomColor: tokens.hairline, borderBottomWidth: 1 }}>
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack}
        style={({ pressed }) => [styles.back, pressed ? { backgroundColor: tokens.bgHover } : null]}>
        <ArrowLeft size={20} color={tokens.fg1} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {action}
    </View>
    {footer}
  </View>
}

const styles = StyleSheet.create({
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 8, paddingBottom: 8, paddingLeft: 8, paddingRight: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  title: { flex: 1, minWidth: 0, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'auto' },
})

import { SPACING } from '@orbit/shared/theme'
import type { PageHeaderProps } from '@orbit/shared/contracts/navigation'
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { ArrowLeft } from '@/components/ui/icons'
import { ShellContent } from '@/components/shell/shell-content'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function PageHeader({ title, backLabel, onBack, action, footer }: Readonly<PageHeaderProps>) {
  const { fontScale } = useWindowDimensions()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View testID="page-header" style={{ borderBottomColor: tokens.hairline, borderBottomWidth: 1 }}>
    <ShellContent><View style={[styles.row, fontScale > 1.3 && styles.multilineRow]}>
      <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack}
        style={({ pressed }) => [styles.back, pressed ? { backgroundColor: tokens.bgHover } : null]}>
        <ArrowLeft size={20} color={tokens.fg1} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={fontScale > 1.3 ? undefined : 1} style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
      {action}
    </View></ShellContent>
    <ShellContent>{footer}</ShellContent>
  </View>
}

const styles = StyleSheet.create({
  row: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: SPACING.s8, paddingBottom: SPACING.s8, paddingLeft: SPACING.s8, paddingRight: SPACING.s16 },
  multilineRow: { alignItems: 'flex-start' },
  back: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 999, overflow: 'hidden' },
  title: { flex: 1, minWidth: 0, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'auto' },
})

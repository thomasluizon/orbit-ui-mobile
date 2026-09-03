import type { ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { ListRowProps } from '@orbit/shared/contracts/lists'
import { ChevronRight } from '@/components/ui/icons'
import { Icon } from '@/components/ui/icon'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function ListRow(props: Readonly<ListRowProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { icon, title, description, value, trailing, danger = false, action, chevron = true, onClick, readOnly = false } = props
  const titleColor = danger ? tokens.statusBad : tokens.fg1
  const body: ReactNode = (
    <>
      {icon ? (
        <View style={styles.iconSlot}>
          {typeof icon === 'string' ? <Icon name={icon} size={24} color={titleColor} /> : icon}
        </View>
      ) : null}
      <View style={styles.textBlock}>
        <Text numberOfLines={1} style={[styles.title, { color: titleColor }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: tokens.fg3 }]}>{description}</Text> : null}
      </View>
      {value ? <Text style={[styles.value, { color: tokens.fg3 }]} numberOfLines={1}>{value}</Text> : null}
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {!readOnly && chevron ? <View style={styles.control}><ChevronRight size={24} color={tokens.fg4} strokeWidth={1.8} /></View> : null}
    </>
  )

  return (
    <View style={styles.row}>
      {readOnly || !onClick ? (
        <View style={styles.body}>{body}</View>
      ) : (
        <Pressable accessibilityRole="button" onPress={onClick} style={({ pressed }) => [styles.body, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null]}>{body}</Pressable>
      )}
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action.label} onPress={action.onPress} style={({ pressed }) => [styles.control, pressed ? { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] } : null]}>
          <Icon name={action.icon} size={20} color={action.danger ? tokens.statusBad : tokens.fg2} />
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { minHeight: 52, flexDirection: 'row', alignItems: 'center' },
  body: { minHeight: 52, flex: 1, minWidth: 0, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 8, gap: 12, flexDirection: 'row', alignItems: 'center' },
  iconSlot: { width: 28, flexShrink: 0, alignItems: 'center' },
  textBlock: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 21.25 },
  description: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6 },
  value: { fontFamily: 'Roboto_400Regular', fontSize: 13, fontVariant: ['tabular-nums'], flexShrink: 1, maxWidth: '50%' },
  trailing: { flexShrink: 0, paddingHorizontal: 8 },
  control: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
})

import { SPACING } from '@orbit/shared/theme'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Check, X } from '@/components/ui/icons'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

function ListBlock({ title, items, itemIcon }: Readonly<{ title: string; items: string[]; itemIcon: 'delete' | 'keep' }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <View style={[styles.box, { backgroundColor: tokens.bgCard, borderColor: tokens.hairline }]}>
      <Text style={[styles.label, { color: tokens.fg3 }]}>{title}</Text>
      {items.map((item) => (
        <View key={item} style={styles.item}>
          {itemIcon === 'delete'
            ? <X size={16} color={tokens.statusBad} strokeWidth={1.8} />
            : <Check size={16} color={tokens.statusDone} strokeWidth={1.8} />}
          <Text style={[styles.itemText, { color: tokens.fg2 }]}>{item}</Text>
        </View>
      ))}
    </View>
  )
}

/** What a fresh start deletes and what it keeps: the two lists the sheet and the flow both show. */
export function FreshStartLists({ deletedItems, preservedItems }: Readonly<{ deletedItems: string[]; preservedItems: string[] }>) {
  const { t } = useTranslation()
  return (
    <View testID="fresh-start-lists" style={styles.row}>
      <ListBlock title={t('profile.freshStart.willDelete')} items={deletedItems} itemIcon="delete" />
      <ListBlock title={t('profile.freshStart.willKeep')} items={preservedItems} itemIcon="keep" />
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  box: { flex: 1, borderWidth: 1, borderRadius: 16, padding: SPACING.s16, gap: 8 },
  label: { fontFamily: 'GeistMono_500Medium', fontSize: 12, letterSpacing: 0.96, textTransform: 'uppercase' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  itemText: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 19.6, flex: 1 },
})

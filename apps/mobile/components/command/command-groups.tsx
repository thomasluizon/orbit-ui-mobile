import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { searchCommands, type SearchCommandId } from '@orbit/shared/utils'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { CalendarDays, ChartLine, CheckCircle2, Home, Plus, SkipForward, User } from '@/components/ui/icons'

const ICONS = { create: Plus, log: CheckCircle2, skip: SkipForward, today: Home, calendar: CalendarDays, progress: ChartLine, profile: User }
const GROUP_KEYS = { create: 'command.groups.create', actions: 'command.groups.actions', destinations: 'command.groups.destinations' } as const

export function CommandGroups({ query, onSelect, hideCreate = false }: Readonly<{ hideCreate?: boolean; query: string; onSelect: (id: SearchCommandId) => void }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const commands = searchCommands(query, null, t).filter((command) => !hideCreate || command.id !== 'create')
  return (['create', 'actions', 'destinations'] as const).map((group) => {
    const entries = commands.filter((command) => command.group === group)
    if (!entries.length) return null
    return <View key={group} style={styles.group}>
      <Text accessibilityRole="header" style={[styles.heading, { color: tokens.fg4 }]}>{t(GROUP_KEYS[group])}</Text>
      {entries.map((entry) => { const Icon = ICONS[entry.id]; return <Pressable key={entry.id} role="button" accessibilityRole="button" onPress={() => onSelect(entry.id)} style={({ pressed }) => [styles.row, { backgroundColor: pressed ? tokens.bgHover : 'transparent' }]}><Icon size={20} color={tokens.fg3} /><Text style={[styles.label, { color: tokens.fg1 }]}>{t(entry.label)}</Text></Pressable> })}
    </View>
  })
}

const styles = StyleSheet.create({
  group: { gap: 4 }, heading: { fontFamily: 'GeistMono_400Regular', fontSize: 12, textTransform: 'uppercase', padding: 12 },
  row: { minHeight: 44, padding: 12, gap: 12, flexDirection: 'row', alignItems: 'center', borderRadius: radius.md },
  label: { flexShrink: 1, fontFamily: 'Geist_400Regular', fontSize: 16 },
})

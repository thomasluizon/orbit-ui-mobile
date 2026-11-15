import { SPACING, SHELL_CONTENT_MAX_WIDTH } from '@orbit/shared/theme'

import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useShellScrollerClearance } from '@/components/shell/shell-scroller-clearance'
import { PageHeader } from '@/components/ui/page-header'
import { KeyboardAwareSheetScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { Input } from '@/components/ui/input'

import { Search } from '@/components/ui/icons'
import { GuidedSearchFrame } from '@/components/search/guided-search-frame'
import { SearchList } from '@/components/search/search-list'
import { useSearchScreen, type SearchScreenModel } from '@/components/search/use-search-screen'
import { useFlag } from '@/hooks/use-flag'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export default function SearchScreen() {
  const model = useSearchScreen()
  return useFlag('orbit_guided_flows') ? <GuidedSearchFrame model={model} /> : <CurrentSearchFrame model={model} />
}

function CurrentSearchFrame({ model }: Readonly<{ model: SearchScreenModel }>) {
  const { t } = useTranslation()
  const clearance = useShellScrollerClearance()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { search, commandPage } = model
  return <View style={[styles.screen, { backgroundColor: tokens.bg }]}>
    <PageHeader title={t('habits.search.title')} onBack={model.back} backLabel={t('common.back')} />
    <KeyboardAwareSheetScrollView style={{ flexGrow: 0 }} contentContainerStyle={[styles.field, styles.columnInset]}>
      {commandPage !== null && <Text style={[styles.chip, { color: tokens.fg2, backgroundColor: tokens.bgWell, borderColor: tokens.hairline }]}>{t(commandPage === 'log' ? 'command.page.log' : 'command.page.skip')}</Text>}
      <View style={styles.input}><Input label={t('habits.search.question')} hideLabel placeholder={t('habits.moveParent.searchPlaceholder')} value={search.text} onChange={search.changeText} trailing={<Search size={20} color={tokens.fg3} />} /></View>
    </KeyboardAwareSheetScrollView>
    <ScrollView role="list" keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.list, styles.columnInset, { paddingBottom: clearance }]} accessibilityState={{ busy: search.busy }}>
      <SearchList model={model} />
    </ScrollView>
  </View>
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: SHELL_CONTENT_MAX_WIDTH }, columnInset: { alignSelf: 'center', width: '100%', maxWidth: 620, paddingHorizontal: SPACING.s16 }, field: { paddingVertical: SPACING.s16, gap: 8, flexDirection: 'row', alignItems: 'center' }, input: { flex: 1, minWidth: 0 },
  list: { paddingTop: SPACING.s16, gap: 8, minHeight: 400 },
  chip: { padding: SPACING.s8, borderRadius: radius.sm, borderWidth: 1, fontFamily: 'Geist_500Medium', fontSize: 12 },
})

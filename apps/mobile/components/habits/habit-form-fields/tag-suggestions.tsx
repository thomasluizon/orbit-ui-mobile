import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import type { createTokensV2 } from '@/lib/theme'
import { tagSuggestionStatusKey } from '@orbit/shared/hooks'
import type { useTagSuggestions } from '@/hooks/use-tag-suggestions'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { AstraGlyph } from '@/components/ui/astra-glyph'
import { PillButton } from '@/components/ui/pill-button'
import { PickerRow } from '@/components/ui/picker-row'
import { Proposed } from '@/components/ui/proposed'

interface TagSuggestionsProps {
  suggestions: ReturnType<typeof useTagSuggestions>
  atLimit: boolean
  disabled: boolean
}

export function TagSuggestions({ suggestions, atLimit, disabled }: Readonly<TagSuggestionsProps>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const pending = suggestions.pending !== null
  const failure = suggestions.error
  const statusKey = tagSuggestionStatusKey(suggestions, atLimit, suggestions.needsTitle)
  return <View style={styles.container}>
    <View style={styles.action}><PillButton hint={suggestions.pending === 'suggest' ? t('habits.form.suggestingTags') : undefined} accessibleName={t('habits.form.suggestTags')} variant="ghost" leadingIcon={<AstraGlyph size={16} color={tokens.fg1} />} disabled={!suggestions.canSuggest} loading={suggestions.pending === 'suggest'} onClick={() => void suggestions.suggest()}>{t('habits.form.suggestTags')}</PillButton></View>
    <Text accessibilityLiveRegion="polite" style={styles.hint}>{statusKey ? t(statusKey) : null}</Text>
    {failure ? <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.error}>{getFriendlyErrorMessage(failure.cause, t, failure.operation === 'suggest' ? 'habits.form.suggestTagsError' : 'toast.errors.validation', failure.operation === 'suggest' ? 'generic' : 'tag')}</Text> : null}
    {suggestions.suggestions.length > 0 ? <Proposed proposed scope="field" label={t('habits.form.suggestedTagsLabel')}><View accessibilityState={{ busy: suggestions.pending === 'accept' }} style={styles.proposals}>
      {suggestions.suggestions.map((suggestion) => <PickerRow proposed key={suggestion.name} name={suggestion.name} selected={false} disabled={disabled || atLimit || pending} onToggle={() => void suggestions.acceptSuggestion(suggestion)} value="" valueHidden valueStyle={styles.hint} />)}
    </View></Proposed> : null}
  </View>
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { gap: 16, paddingTop: 16 }, action: { alignSelf: 'flex-start' }, proposals: { gap: 8, padding: 8 },
    hint: { color: tokens.fg3, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
    error: { color: tokens.statusBadText, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  })
}

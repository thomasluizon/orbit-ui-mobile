import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { buildPromptPage, INITIAL_PROMPT_FILTERS, reducePromptFilters, PROMPT_CATEGORIES } from '@orbit/shared/chat/prompt-library'
import type { ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { motionDurations, motionEasings, motionLayerTiming, TOUCH_TARGET_MIN } from '@orbit/shared/theme'
import { TypedTextInput } from '@/components/ui/typed-text-input'
import { ActionRow } from '@/components/ui/action-row'
import { AppBar } from '@/components/ui/app-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Chip } from '@/components/ui/chip'
import { ListRow } from '@/components/ui/list-row'
import { Button } from '@/components/ui/pill-button'
import { SectionLabel } from '@/components/ui/section-label'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { createAnimatedTimingConfig, usePrefersReducedMotion } from '@/lib/motion'

type PromptLibraryProps = {
  visible?: boolean
  onExitComplete?: () => void
  onBack: () => void
  onSelect: (id: string, label: string, prompt: string) => void
  suggestions: ComposerSuggestions
  hasProAccess: boolean
  hasGoogleConnection: boolean
  disabledReason?: string
}

export function PromptLibrary(props: Readonly<PromptLibraryProps>) {
  const { t, i18n } = useTranslation()
  const visibleLayer = props.visible ?? true
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const insets = useSafeAreaInsets()
  const reducedMotion = usePrefersReducedMotion()
  const [searchFocused, setSearchFocused] = useState(false)
  const { onExitComplete } = props
  const progress = useMemo(() => new Animated.Value(0), [])
  const headingRef = useRef<Text>(null)
  const [filters, dispatch] = useReducer(reducePromptFilters, INITIAL_PROMPT_FILTERS)
  const [previousVisible, setPreviousVisible] = useState(visibleLayer)
  if (previousVisible !== visibleLayer) {
    setPreviousVisible(visibleLayer)
    if (visibleLayer) dispatch({ type: 'reset' })
  }
  const { query } = filters
  const { categories, activeCategory, matches, lastPage, currentPage, visible } = buildPromptPage({ ...props, filters, locale: i18n.language, translate: t })
  useEffect(() => {
    if (visibleLayer && headingRef.current) AccessibilityInfo.sendAccessibilityEvent(headingRef.current, 'focus')
  }, [visibleLayer])
  useEffect(() => {
    let cancelled = false
    const duration = visibleLayer ? motionDurations.base : motionDurations.routeExit
    const animation = Animated.timing(progress, { ...createAnimatedTimingConfig(reducedMotion ? motionDurations.micro : duration, motionEasings.standard), toValue: visibleLayer ? 1 : 0 })
    animation.start(() => { if (!cancelled && !visibleLayer) onExitComplete?.() })
    return () => { cancelled = true; animation.stop() }
  }, [progress, reducedMotion, visibleLayer, onExitComplete])

  return <Animated.View testID="prompt-library" pointerEvents={visibleLayer ? 'auto' : 'none'} accessibilityElementsHidden={!visibleLayer} importantForAccessibility={visibleLayer ? 'auto' : 'no-hide-descendants'} style={[styles.layer, { backgroundColor: tokens.bg, paddingBottom: insets.bottom, opacity: progress, transform: [{ translateX: reducedMotion ? 0 : progress.interpolate({ inputRange: [0, 1], outputRange: [motionLayerTiming.routeShift, 0] }) }] }]}>
    <AppBar title={t('chat.templates.title')} titleRef={headingRef} onBack={props.onBack} backLabel={t('chat.templates.back')} />
    <View style={styles.controls}>
      {props.disabledReason ? <CapacityNotice message={props.disabledReason} /> : null}
      <View style={{ gap: 4 }}>
        <Text nativeID="prompt-search-label" style={{ fontFamily: 'Geist_500Medium', fontSize: 14, color: tokens.fg2 }}>{t('chat.templates.search')}</Text>
        <TypedTextInput onFocus={() => setSearchFocused(true)} onBlur={() => setSearchFocused(false)} autoComplete="off" accessibilityLabel={t('chat.templates.search')} accessibilityLabelledBy="prompt-search-label" value={query} onChangeText={value => { dispatch({ type: 'query', query: value }) }}
          style={[styles.search, { color: tokens.fg1, backgroundColor: tokens.bgField, borderColor: searchFocused ? tokens.primary : tokens.borderControl, borderWidth: searchFocused ? 2 : 1 }]} />
      </View>
      <ScrollView horizontal style={{ flexGrow: 0 }} testID="prompt-categories" contentContainerStyle={styles.categories} keyboardShouldPersistTaps="handled">
        {categories.map(item => <Chip key={item} active={item === activeCategory && !query.trim()} onPress={() => { dispatch({ type: 'category', category: item }) }}>{t(`chat.templates.categories.${item}`)}</Chip>)}
      </ScrollView>
    </View>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
      {props.suggestions.length > 0 ? <View>
        <SectionLabel>{t('chat.templates.forYou')}</SectionLabel>
        {props.suggestions.map(suggestion => <ListRow key={suggestion.id} title={suggestion.label} textMode="label" chevron={false} disabled={!!props.disabledReason} onClick={() => { suggestion.onSelect(); props.onBack() }} />)}
      </View> : null}
      {PROMPT_CATEGORIES.map(item => {
        const rows = visible.filter(template => template.category === item)
        return rows.length > 0 ? <View key={item}>
          <SectionLabel>{t(`chat.templates.categories.${item}`)}</SectionLabel>
          {rows.map(template => <ListRow key={template.id} title={t(template.labelKey)} textMode="label" chevron={false} disabled={!!props.disabledReason}
            onClick={() => props.onSelect(template.id, t(template.labelKey), t(template.promptKey))} />)}
        </View> : null
      })}
      <View style={matches.length === 0 ? styles.empty : undefined}>
        <Text accessibilityLiveRegion="polite" style={matches.length === 0 ? { fontFamily: 'Geist_400Regular', fontSize: 14, color: tokens.fg3 } : styles.silentStatus}>{matches.length === 0 ? t('chat.templates.noMatches', { query: query.trim() }) : ''}</Text>
        {matches.length === 0 ? <Button variant="ghost" onClick={() => { dispatch({ type: 'query', query: '' }) }}>{t('chat.templates.clearSearch')}</Button> : null}
      </View>
      {lastPage > 0 ? <View style={styles.pages}><ActionRow>
        <Button variant="ghost" disabled={currentPage === 0} onClick={() => dispatch({ type: 'page', page: currentPage - 1 })}>{t('chat.templates.previous')}</Button>
        <Button variant="ghost" disabled={currentPage === lastPage} onClick={() => dispatch({ type: 'page', page: currentPage + 1 })}>{t('chat.templates.more')}</Button>
      </ActionRow></View> : null}
    </ScrollView>
  </Animated.View>
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 1 },
  controls: { paddingHorizontal: 16, gap: 12 },
  search: { minHeight: TOUCH_TARGET_MIN, borderRadius: 8, borderWidth: 1, paddingHorizontal: 12, fontFamily: 'Geist_400Regular', fontSize: 16 },
  categories: { flexDirection: 'row', flexWrap: 'nowrap', gap: 12, paddingBottom: 4 },
  silentStatus: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  empty: { alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 24 },
  pages: { paddingHorizontal: 16, paddingTop: 16 },
})

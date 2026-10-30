import { ShellContent } from '@/components/shell/shell-content'
import { IconButton } from '@/components/ui/icon-button'
import { X, ChevronLeft, ChevronRight } from '@/components/ui/icons'
import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import { buildPromptPage } from '@orbit/shared/chat/prompt-library'
import { createUsePromptLibrary, groupPromptIdeas, type PromptIdeaGroup } from '@orbit/shared/chat/prompt-library-core'
import type { ComposerSuggestions } from '@orbit/shared/contracts/composer'
import { motionDurations, motionEasings, motionLayerTiming, SPACING } from '@orbit/shared/theme'
import { KeyboardAwareScrollView } from '@/components/ui/keyboard-aware-scroll-view'
import { Input } from '@/components/ui/input'
import { ActionRow } from '@/components/ui/action-row'
import { AppBar } from '@/components/ui/app-bar'
import { CapacityNotice } from '@/components/ui/capacity-notice'
import { Chip } from '@/components/ui/chip'
import { CatalogIdea, PromptIdea } from './prompt-idea'

import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { createAnimatedTimingConfig, usePrefersReducedMotion } from '@/lib/motion'

const usePromptLibrary = createUsePromptLibrary({ useState, useReducer, useEffect, useRef })

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

function CatalogGroup({ group, searching, disabled, onSelect }: Readonly<{ group: PromptIdeaGroup; searching: boolean; disabled: boolean; onSelect: PromptLibraryProps['onSelect'] }>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return <View role="group" accessibilityLabel={group.label}>
    {searching ? <Text accessibilityRole="header" style={[styles.groupTitle, { color: tokens.fg1 }]}>{group.label}</Text> : null}
    <View style={{ paddingHorizontal: SPACING.s16, gap: SPACING.s12 }}>{group.templates.map(template => <CatalogIdea key={template.id} template={template} disabled={disabled} onSelect={onSelect} />)}</View>
  </View>
}

export function PromptLibrary(props: Readonly<PromptLibraryProps>) {
  const { t, i18n } = useTranslation()
  const visibleLayer = props.visible ?? true
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const insets = useSafeAreaInsets()
  const reducedMotion = usePrefersReducedMotion()
  const { onExitComplete } = props
  const progress = useMemo(() => new Animated.Value(0), [])
  const { filters, dispatch, select } = usePromptLibrary(visibleLayer, props.disabledReason)
  const headingRef = useRef<Text>(null)
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
    <AppBar title={t('chat.templates.title')} titleVariant="screen" titleRef={headingRef} onBack={props.onBack} backLabel={t('chat.templates.back')} />
    <ShellContent style={{ flex: 1 }}>
    <KeyboardAwareScrollView avoidKeyboard={false} style={{ flexGrow: 0 }} containerStyle={{ flex: 0, flexShrink: 1 }} contentContainerStyle={styles.controls}>
      {props.disabledReason ? <CapacityNotice message={props.disabledReason} /> : null}
      <Input kind="search" autoComplete="off" hideLabel label={t('chat.templates.search')} placeholder={t('chat.templates.search')} value={query} onChange={value => dispatch({ type: 'query', query: value })} />
      <ScrollView horizontal persistentScrollbar showsHorizontalScrollIndicator style={{ flexGrow: 0 }} testID="prompt-categories" contentContainerStyle={styles.categories} keyboardShouldPersistTaps="handled">
        {categories.map(item => <Chip key={item} active={item === activeCategory && !query.trim()} onPress={() => { dispatch({ type: 'category', category: item }) }}>{t(`chat.templates.categories.${item}`)}</Chip>)}
      </ScrollView>
    </KeyboardAwareScrollView>
    <ScrollView style={{ flex: 1 }} testID="prompt-results" contentContainerStyle={{ paddingVertical: SPACING.s16, gap: SPACING.s24 }} keyboardShouldPersistTaps="handled">
      {props.suggestions.length > 0 && !query.trim() ? <View role="group" accessibilityLabel={t('chat.templates.forYou')}>
        <Text accessibilityRole="header" style={[styles.groupTitle, { color: tokens.fg1 }]}>{t('chat.templates.forYou')}</Text>
        <View style={{ paddingHorizontal: SPACING.s16, gap: SPACING.s12 }}>{props.suggestions.map(suggestion => <PromptIdea key={suggestion.id} label={suggestion.label} icon={suggestion.icon} disabled={!!props.disabledReason} onSelect={() => select(() => { suggestion.onSelect(); props.onBack() })} />)}</View>
      </View> : null}
      {groupPromptIdeas(visible, t).map(group => <CatalogGroup key={group.category} group={group} searching={!!query.trim()} disabled={!!props.disabledReason} onSelect={(...selection) => select(() => props.onSelect(...selection))} />)}
      <View style={matches.length === 0 ? styles.empty : styles.silentStatus}>
        <Text accessibilityLiveRegion="polite" style={matches.length === 0 ? { fontFamily: 'Geist_400Regular', fontSize: 14, color: tokens.fg3 } : styles.silentStatus}>{matches.length === 0 ? t('chat.templates.noMatches', { query: query.trim() }) : ''}</Text>
        {matches.length === 0 ? <IconButton label={t('chat.templates.clearSearch')} onClick={() => { dispatch({ type: 'query', query: '' }) }}><X size={20} strokeWidth={1.5} accessible={false} /></IconButton> : null}
      </View>
      {lastPage > 0 ? <View style={styles.pages}><ActionRow>
        <IconButton label={t('chat.templates.previous')} disabled={currentPage === 0} onClick={() => dispatch({ type: 'page', page: currentPage - 1 })}><ChevronLeft size={20} strokeWidth={1.5} accessible={false} /></IconButton>
        <IconButton label={t('chat.templates.more')} disabled={currentPage === lastPage} onClick={() => dispatch({ type: 'page', page: currentPage + 1 })}><ChevronRight size={20} strokeWidth={1.5} accessible={false} /></IconButton>
      </ActionRow></View> : null}
    </ScrollView>
    </ShellContent>
  </Animated.View>
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, zIndex: 1 },
  groupTitle: { fontFamily: 'Geist_500Medium', fontSize: 20, paddingHorizontal: SPACING.s16, paddingBottom: SPACING.s12 },
  controls: { paddingHorizontal: SPACING.s16, gap: 12 },
  categories: { flexDirection: 'row', flexWrap: 'nowrap', gap: 12, paddingBottom: SPACING.s8 },
  silentStatus: { position: 'absolute', width: 1, height: 1, overflow: 'hidden' },
  empty: { alignItems: 'flex-start', gap: 12, paddingHorizontal: SPACING.s16, paddingVertical: SPACING.s24 },
  pages: { paddingHorizontal: SPACING.s16, paddingTop: SPACING.s16 },
})

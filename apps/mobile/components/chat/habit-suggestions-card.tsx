import { lazy, Suspense, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Animated, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ChatMessage, HabitSuggestionDraft, HabitSuggestionsCard as Suggestions } from '@orbit/shared/types'
import { habitSuggestionSchedule, createUseHabitSuggestionView, type HabitSuggestionView } from '@orbit/shared/chat'
import { motionDurations, motionEasings } from '@orbit/shared/theme'
import { useHabitSuggestionActions } from '@/hooks/use-habit-suggestion-actions'
import { useChatCardOperation } from '@/hooks/use-chat-card-operation'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitDetail } from '@/hooks/use-habit-queries'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { createAnimatedTimingConfig, usePrefersReducedMotion } from '@/lib/motion'
import { BlockFrame } from '@/components/ui/block-frame'
import { IconButton } from '@/components/ui/icon-button'
import { PillButton } from '@/components/ui/pill-button'
import { Input } from '@/components/ui/input'
import { Proposed } from '@/components/ui/proposed'
import { Plus, Pencil, AdjustmentsHorizontal, RefreshCw, ArrowUp } from '@/components/ui/icons'
import { HabitBlockRow } from './habit-block-row'

const HabitSuggestionEditor = lazy(async () => ({ default: (await import('./habit-suggestion-editor')).HabitSuggestionEditor }))

const useHabitSuggestionView = createUseHabitSuggestionView({ useState, useSyncExternalStore })

function SuggestionRow({ draft, view, isOnline }: Readonly<{ draft: HabitSuggestionDraft; view: HabitSuggestionView; isOnline: boolean }>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { displayTime } = useTimeFormat()
  const current = useHabitDetail(draft.existingHabitId ?? null)
  const disabled = view.disabled || !view.available(draft.id)
  const error = view.state.errors[draft.id]
  const revision = view.state.revisions[draft.id] ?? 0
  const opacity = useMemo(() => new Animated.Value(1), [])
  const reducedMotion = usePrefersReducedMotion()
  useEffect(() => {
    if (!revision || reducedMotion) { opacity.setValue(1); return }
    opacity.setValue(0)
    const animation = Animated.timing(opacity, createAnimatedTimingConfig(motionDurations.fast, motionEasings.standard))
    animation.start()
    return () => { animation.stop(); opacity.setValue(1) }
  }, [opacity, revision, reducedMotion])
  return <View testID={`suggestion-${draft.id}`} style={{ minWidth: 0, gap: 8 }} accessibilityState={{ busy: view.state.busy === draft.id }}>
    <Animated.View style={{ opacity }}>
      <Proposed proposed scope="block" inset label={t('chat.habitSuggestions.proposed')}>
        <HabitBlockRow proposed title={draft.title} emoji={draft.emoji} meta={habitSuggestionSchedule(draft, i18n.language, t, displayTime)} reason={draft.reason} />
      </Proposed>
    </Animated.View>
    {draft.existingHabitId ? <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 12, color: tokens.fg3 }}>{t('chat.habitSuggestions.existing')}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 12, color: tokens.fg2 }}>{t('chat.habitSuggestions.current')}</Text><Text style={{ fontSize: 12, color: tokens.fg3 }}>{current.data ? habitSuggestionSchedule(current.data, i18n.language, t, displayTime) : current.isError ? t('chat.habitSuggestions.scheduleError') : t('common.loading')}</Text></View>
        <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontSize: 12, color: tokens.fg2 }}>{t('chat.habitSuggestions.proposed')}</Text><Text style={{ fontSize: 12, color: tokens.fg3 }}>{habitSuggestionSchedule(draft, i18n.language, t, displayTime)}</Text></View>
      </View>
      {current.isError ? <IconButton label={t('common.retry')} disabled={!isOnline} onPress={() => void current.refetch()}><RefreshCw size={20} color={tokens.fg2} /></IconButton> : null}
    </View> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <IconButton label={t('chat.habitSuggestions.add')} disabled={disabled} loading={view.state.busy === draft.id && view.state.phase === 'preview'} onPress={() => void view.add(draft.id)}><Plus size={20} color={tokens.fg2} /></IconButton>
      <IconButton label={t('chat.habitSuggestions.edit')} disabled={disabled || Boolean(draft.existingHabitId && !current.data)} onPress={() => view.edit(draft.id)}><Pencil size={20} color={tokens.fg2} /></IconButton>
      <IconButton label={t('chat.habitSuggestions.tweak')} disabled={disabled} accessibilityState={{ expanded: view.state.tweaking === draft.id }} onPress={() => view.controller.tweak(draft.id)}><AdjustmentsHorizontal size={20} color={tokens.fg2} /></IconButton>
      <IconButton label={t('chat.habitSuggestions.swap')} loading={view.state.busy === draft.id && view.state.phase === 'refine' && view.state.tweaking !== draft.id} disabled={disabled} onPress={() => void view.refine(draft.id, t('chat.habitSuggestions.swapInstruction'))}><RefreshCw size={20} color={tokens.fg2} /></IconButton>
      {!view.available(draft.id) ? <Text style={{ fontSize: 12, color: tokens.fg3 }}>{t('chat.habitSuggestions.review')}</Text> : null}
    </View>
    {view.state.tweaking === draft.id ? <Input autoFocus hideLabel label={t('chat.habitSuggestions.prompt')} placeholder={t('chat.habitSuggestions.prompt')} value={view.state.instruction} onChange={view.controller.setInstruction} disabled={disabled} onCancel={() => view.controller.tweak(draft.id)} onSubmit={() => void view.refine(draft.id, view.state.instruction)} trailing={<IconButton label={t('chat.habitSuggestions.apply')} loading={view.state.busy === draft.id && view.state.phase === 'refine'} disabled={disabled || !view.state.instruction.trim()} onPress={() => void view.refine(draft.id, view.state.instruction)}><ArrowUp size={20} color={tokens.fg2} /></IconButton>} /> : null}
    <View accessibilityLiveRegion="polite">{error ? <><Text style={{ fontSize: 14, color: tokens.statusBadText }}>{t(error)}</Text><IconButton label={t('common.retry')} disabled={view.disabled} onPress={() => void view.retry(draft.id)}><RefreshCw size={20} color={tokens.fg2} /></IconButton></> : null}</View>
  </View>
}

export function HabitSuggestionsCard({ card, message, isOnline = true }: Readonly<{ card: Suggestions; message: ChatMessage; isOnline?: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const actions = useHabitSuggestionActions(message.id, card.language)
  const track = useChatCardOperation()
  const view = useHabitSuggestionView(card, message, { ...actions, refine: (...args) => track(() => actions.refine(...args)), preview: (...args) => track(() => actions.preview(...args)) }, isOnline)
  const error = view.state.errors.all
  return <>
    <BlockFrame title={t('chat.habitSuggestions.title')} count={null} state={view.state.busy ? 'acting' : 'resting'} items={[]} body={<View style={{ minWidth: 0, gap: 16 }}>{view.drafts.map(draft => <SuggestionRow key={draft.id} draft={draft} view={view} isOnline={isOnline} />)}{!view.drafts.length ? <Text style={{ fontSize: 14, color: tokens.fg3 }}>{t('chat.habitSuggestions.added')}</Text> : null}</View>} actions={<View style={{ alignItems: 'flex-start', gap: 8 }}>
      {view.drafts.some(draft => view.available(draft.id)) ? <PillButton disabled={view.disabled} loading={view.state.busy === 'all'} onPress={() => void view.addAll()}>{t('chat.habitSuggestions.addAll')}</PillButton> : null}
      <View accessibilityLiveRegion="polite">{error ? <><Text style={{ fontSize: 14, color: tokens.statusBadText }}>{t(error)}</Text><IconButton label={t('common.retry')} disabled={view.disabled} onPress={() => void view.retry('all')}><RefreshCw size={20} color={tokens.fg2} /></IconButton></> : null}</View>
      {!isOnline ? <Text style={{ fontSize: 14, color: tokens.fg3 }}>{t('chat.habitSuggestions.offline')}</Text> : null}
    </View>} />
    {view.editing ? <Suspense fallback={null}><HabitSuggestionEditor key={view.editing.id} draft={view.editing} onClose={() => view.edit(null)} onSaved={() => view.applied(view.editing!.id)} /></Suspense> : null}
  </>
}

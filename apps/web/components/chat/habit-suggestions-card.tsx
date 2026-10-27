'use client'

import { lazy, Suspense, useState, useSyncExternalStore } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import type { ChatMessage, HabitSuggestionDraft, HabitSuggestionsCard as Suggestions } from '@orbit/shared/types'
import { habitSuggestionSchedule, createUseHabitSuggestionView, type HabitSuggestionView } from '@orbit/shared/chat'
import { useHabitSuggestionActions } from '@/hooks/use-habit-suggestion-actions'
import { useChatCardOperation } from '@/hooks/use-chat-card-operation'
import { useTimeFormat } from '@/hooks/use-time-format'
import { useHabitDetail } from '@/hooks/use-habit-queries'
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
  const t = useTranslations()
  const locale = useLocale()
  const { displayTime } = useTimeFormat()
  const current = useHabitDetail(draft.existingHabitId ?? null)
  const disabled = view.disabled || !view.available(draft.id)
  const error = view.state.errors[draft.id]
  const revision = view.state.revisions[draft.id] ?? 0
  return <div className="flex min-w-0 flex-col gap-2" data-suggestion-id={draft.id} aria-busy={view.state.busy === draft.id}>
    <div key={revision} className={revision ? 'habit-suggestion-swap' : undefined}>
      <Proposed proposed scope="block" inset label={t('chat.habitSuggestions.proposed')}>
        <HabitBlockRow proposed title={draft.title} emoji={draft.emoji} meta={habitSuggestionSchedule(draft, locale, t, displayTime)} reason={draft.reason} />
      </Proposed>
    </div>
    {draft.existingHabitId ? <div className="flex flex-col gap-2 text-xs text-[var(--fg-3)]">
      <span>{t('chat.habitSuggestions.existing')}</span>
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1"><span className="text-[var(--fg-2)]">{t('chat.habitSuggestions.current')}</span><p>{current.data ? habitSuggestionSchedule(current.data, locale, t, displayTime) : current.isError ? t('chat.habitSuggestions.scheduleError') : t('common.loading')}</p></div>
        <div className="min-w-0 flex-1"><span className="text-[var(--fg-2)]">{t('chat.habitSuggestions.proposed')}</span><p>{habitSuggestionSchedule(draft, locale, t, displayTime)}</p></div>
      </div>
      {current.isError ? <IconButton label={t('common.retry')} disabled={!isOnline} onClick={() => void current.refetch()}><RefreshCw size={20} /></IconButton> : null}
    </div> : null}
    <div className="flex flex-wrap items-center gap-2">
      <IconButton label={t('chat.habitSuggestions.add')} disabled={disabled} loading={view.state.busy === draft.id && view.state.phase === 'preview'} onClick={() => void view.add(draft.id)}><Plus size={20} /></IconButton>
      <IconButton label={t('chat.habitSuggestions.edit')} disabled={disabled || Boolean(draft.existingHabitId && !current.data)} onClick={() => view.edit(draft.id)}><Pencil size={20} /></IconButton>
      <IconButton label={t('chat.habitSuggestions.tweak')} disabled={disabled} aria-expanded={view.state.tweaking === draft.id} onClick={() => view.controller.tweak(draft.id)}><AdjustmentsHorizontal size={20} /></IconButton>
      <IconButton label={t('chat.habitSuggestions.swap')} loading={view.state.busy === draft.id && view.state.phase === 'refine' && view.state.tweaking !== draft.id} disabled={disabled} onClick={() => void view.refine(draft.id, t('chat.habitSuggestions.swapInstruction'))}><RefreshCw size={20} /></IconButton>
      {!view.available(draft.id) ? <span className="text-xs text-[var(--fg-3)]">{t('chat.habitSuggestions.review')}</span> : null}
    </div>
    {view.state.tweaking === draft.id ? <Input autoFocus hideLabel label={t('chat.habitSuggestions.prompt')} placeholder={t('chat.habitSuggestions.prompt')} value={view.state.instruction} onChange={view.controller.setInstruction} disabled={disabled} onCancel={() => view.controller.tweak(draft.id)} onSubmit={() => void view.refine(draft.id, view.state.instruction)} trailing={<IconButton label={t('chat.habitSuggestions.apply')} loading={view.state.busy === draft.id && view.state.phase === 'refine'} disabled={disabled || !view.state.instruction.trim()} onClick={() => void view.refine(draft.id, view.state.instruction)}><ArrowUp size={20} /></IconButton>} /> : null}
    <div role="status" aria-live="polite" className="text-sm text-[var(--status-bad-text)]">{error ? <>{t(error)}<IconButton label={t('common.retry')} disabled={view.disabled} onClick={() => void view.retry(draft.id)}><RefreshCw size={20} /></IconButton></> : null}</div>
  </div>
}

export function HabitSuggestionsCard({ card, message, isOnline = true }: Readonly<{ card: Suggestions; message: ChatMessage; isOnline?: boolean }>) {
  const t = useTranslations()
  const actions = useHabitSuggestionActions(message.id, card.language)
  const track = useChatCardOperation()
  const view = useHabitSuggestionView(card, message, { ...actions, refine: (...args) => track(() => actions.refine(...args)), preview: (...args) => track(() => actions.preview(...args)) }, isOnline)
  const error = view.state.errors.all
  return <>
    <BlockFrame title={t('chat.habitSuggestions.title')} count={null} state={view.state.busy ? 'acting' : 'resting'} items={[]} body={<div className="flex min-w-0 flex-col gap-4">{view.drafts.map(draft => <SuggestionRow key={draft.id} draft={draft} view={view} isOnline={isOnline} />)}{!view.drafts.length ? <p className="text-sm text-[var(--fg-3)]">{t('chat.habitSuggestions.added')}</p> : null}</div>} actions={<div className="flex flex-col items-start gap-2">
      {view.drafts.some(draft => view.available(draft.id)) ? <PillButton disabled={view.disabled} loading={view.state.busy === 'all'} onClick={() => void view.addAll()}>{t('chat.habitSuggestions.addAll')}</PillButton> : null}
      <div role="status" aria-live="polite" className="text-sm text-[var(--status-bad-text)]">{error ? <>{t(error)}<IconButton label={t('common.retry')} disabled={view.disabled} onClick={() => void view.retry('all')}><RefreshCw size={20} /></IconButton></> : null}</div>
      {!isOnline ? <p className="text-sm text-[var(--fg-3)]">{t('chat.habitSuggestions.offline')}</p> : null}
    </div>} />
    {view.editing ? <Suspense fallback={null}><HabitSuggestionEditor key={view.editing.id} draft={view.editing} onClose={() => view.edit(null)} onSaved={() => view.applied(view.editing!.id)} /></Suspense> : null}
  </>
}

'use client'

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { FlowStepView } from '@orbit/shared/contracts/flow'
import type { HabitTag, NormalizedHabit } from '@orbit/shared/types/habit'
import { buildTagLineItems } from '@orbit/shared/utils'
import { MAX_TAG_NAME_LENGTH } from '@orbit/shared/validation'
import { TagSuggestions } from '@/components/habits/habit-form-fields/tag-suggestions'
import { Input } from '@/components/ui/input'
import { OptionCard } from '@/components/ui/option-card'
import { IconButton } from '@/components/ui/icon-button'
import { Plus } from '@/components/ui/icons'
import { QuestionRow } from '@/components/ui/question-row'
import { useAstraAllowanceCopy } from '@/hooks/use-astra-allowance-copy'
import { useHabits } from '@/hooks/use-habit-queries'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import { useTagStepActions, type TagStepActions } from '@/hooks/use-tag-step-actions'
import { TagStepRows } from './tag-step-list'

const QUICK_TAGS = 4

export interface TagStepProps {
  /** The tag selection the habit form owns. The step is a view over it. */
  tags: TagSelectionState
  /** The habit title and description: the context of the tag suggestion. */
  title: string
  description: string
  /** The step's own continue, and the answer `Sem tag`. */
  onContinue: () => void
}

/** The selected tags first, then the order the list has today. */
function quickTags(available: readonly HabitTag[], selectedIds: readonly string[]): HabitTag[] {
  const selected = new Set(selectedIds)
  return [...available.filter((tag) => selected.has(tag.id)), ...available.filter((tag) => !selected.has(tag.id))].slice(0, QUICK_TAGS)
}

/** The Orbit line after a press: the tag's own items, read on the device from the cache that holds every habit. */
function useTagLine(pressedTagId: string | null, available: readonly HabitTag[]): string {
  const t = useTranslations()
  const locale = useLocale()
  const { data } = useHabits({})
  const tag = available.find((candidate) => candidate.id === pressedTagId)
  if (!tag) return t('habits.flow.tags.lineIntro')
  const habits: NormalizedHabit[] | undefined = data ? [...data.habitsById.values()] : undefined
  const items = buildTagLineItems(tag.id, habits, locale, (count) => t('habits.flow.tags.more', { count }))
  if (items === null) return t('habits.flow.tags.lineIntro')
  return items.kind === 'empty' ? t('habits.flow.tags.lineEmpty', { tag: tag.name }) : t('habits.flow.tags.lineHas', { tag: tag.name, items: items.items })
}

function TagStepFree({ tags, actions, onPressTag }: Readonly<{ tags: TagSelectionState; actions: TagStepActions; onPressTag: (tagId: string) => void }>) {
  const t = useTranslations()
  const allowanceText = useAstraAllowanceCopy()
  const [query, setQuery] = useState('')
  const [managing, setManaging] = useState(false)
  const create = () => void actions.createNewTag()
  return (
    <>
      {tags.atTagLimit ? <p data-tag-limit="" className="text-center text-sm text-[var(--fg-3)]">{t('habits.form.tagLimit')}</p> : null}
      <Input label={t('habits.form.newTag')} name="newTag" value={tags.newTagName} maxLength={MAX_TAG_NAME_LENGTH} placeholder={t('habits.form.tagName')}
        error={actions.newTagError} focusRequest={actions.newTagFocusRequest} disabled={actions.creating} onChange={actions.changeNewTagName} onSubmit={create} />
      <div className="flex justify-end">
        <IconButton label={t('common.add')} loading={actions.creating} disabled={tags.atTagLimit} onClick={create}><Plus size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
      </div>
      {actions.availableTags.length > QUICK_TAGS ? <Input kind="search" label={t('habits.form.searchTags')} name="tagSearch" value={query} onChange={setQuery} /> : null}
      {actions.availableTags.length > 0 ? <QuestionRow question={t('habits.flow.tags.manage')} onPress={() => setManaging((open) => !open)} /> : null}
      <TagStepRows tags={tags} actions={actions} query={query} managing={managing} onPressTag={onPressTag} />
      {actions.deleteError ? <p role="alert" className="text-sm text-[var(--status-bad-text)]">{actions.deleteError}</p> : null}
      <TagSuggestions translateError={allowanceText} suggestions={actions.suggestions} atLimit={tags.atTagLimit} disabled={actions.pending} />
    </>
  )
}

/** The tag step: "Quer juntar com coisas parecidas?". A press on a tag toggles it and shows what is already in it. The step continues on its own action. */
export function useTagStepView({ tags, title, description, onContinue }: Readonly<TagStepProps>): FlowStepView {
  const t = useTranslations()
  const actions = useTagStepActions(tags, { title, description })
  const [pressedTagId, setPressedTagId] = useState<string | null>(null)
  const line = useTagLine(pressedTagId, actions.availableTags)
  const pressTag = (tagId: string) => { tags.toggleTag(tagId); setPressedTagId(tagId) }
  const selected = new Set(tags.selectedTagIds)
  const thinking = actions.suggestions.pending === 'suggest'
  return {
    question: t('habits.flow.optional.tags'),
    line,
    lineKey: pressedTagId ?? 'intro',
    orbitState: thinking ? 'pensando' : 'parado',
    statusText: thinking ? t('habits.form.suggestingTags') : undefined,
    options: <>
      {quickTags(actions.availableTags, tags.selectedTagIds).map((tag) => (
        <OptionCard key={tag.id} label={tag.name} selected={selected.has(tag.id)} disabled={!selected.has(tag.id) && tags.atTagLimit} disabledReason={t('habits.form.tagLimit')} onSelect={() => pressTag(tag.id)} />
      ))}
      <OptionCard label={t('habits.flow.tags.none')} onSelect={() => { tags.resetTags([]); onContinue() }} />
    </>,
    free: <TagStepFree tags={tags} actions={actions} onPressTag={pressTag} />,
    primary: { label: t('habits.flow.continue'), onPress: onContinue },
  }
}

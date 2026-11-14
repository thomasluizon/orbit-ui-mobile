'use client'

import { useTranslations } from 'next-intl'
import type { HabitTag } from '@orbit/shared/types/habit'
import { ListMotionItem, ListPresence } from '@/components/motion/list-motion'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { TagPickerRow } from '@/components/habits/habit-form-fields/tag-picker-field'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { TagStepActions } from '@/hooks/use-tag-step-actions'

interface TagStepRowsProps {
  tags: TagSelectionState
  actions: TagStepActions
  /** The search words. A row shows when its name holds them. */
  query: string
  /** Every row shows while the person renames or deletes. Otherwise rows show only for a search. */
  managing: boolean
  onPressTag: (tagId: string) => void
}

function matches(tag: HabitTag, query: string): boolean {
  return tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
}

/** The rows of the free path: the search results, and every tag with its own rename and delete controls. A row enters and leaves with the list motion. */
export function TagStepRows({ tags, actions, query, managing, onPressTag }: Readonly<TagStepRowsProps>) {
  const t = useTranslations()
  const searching = query.trim().length > 0
  if (!managing && !searching) return null
  const rows = actions.availableTags.filter((tag) => matches(tag, query))
  const selected = new Set(tags.selectedTagIds)
  const initialName = actions.availableTags.find((tag) => tag.id === tags.editingTagId)?.name ?? ''
  return (
    <div data-tag-step-rows="" className="flex flex-col gap-1">
      {searching && rows.length === 0 ? <p className="text-center text-sm text-[var(--fg-3)]">{t('habits.flow.tags.searchMiss')}</p> : null}
      <ListPresence>
        {rows.map((tag) => (
          <ListMotionItem key={tag.id}>
            {tags.editingTagId === tag.id ? (
              <TagEditorRow
                error={actions.editTagError}
                focusRequest={actions.editTagFocusRequest}
                initialValue={initialName}
                value={tags.editTagName}
                disabled={actions.renaming}
                inputAriaLabel={t('habits.form.tagName')}
                cancelAriaLabel={t('common.cancel')}
                actionLabel={t('common.save')}
                onChange={actions.changeEditTagName}
                onCommit={() => void actions.saveEditedTag()}
                onCancel={actions.discardEditor}
              />
            ) : (
              <TagPickerRow
                tag={tag}
                selected={selected.has(tag.id)}
                atLimit={tags.atTagLimit}
                disabled={actions.pending}
                onToggle={onPressTag}
                onEdit={tags.startEditTag}
                onDelete={(id) => void actions.deleteExistingTag(id)}
                editLabel={t('habits.form.editTag')}
                deleteLabel={t('habits.form.deleteTag')}
              />
            )}
          </ListMotionItem>
        ))}
      </ListPresence>
    </div>
  )
}

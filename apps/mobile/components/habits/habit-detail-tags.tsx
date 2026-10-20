import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { NormalizedHabit, HabitTag } from '@orbit/shared/types/habit'
import { saveHabitDetailTag } from '@orbit/shared/hooks'
import { MAX_TAGS_PER_HABIT } from '@orbit/shared/validation'
import { getFriendlyErrorMessage } from '@orbit/shared/utils'
import { useTags, useCreateTag, useUpdateTag, useDeleteTag, useAssignTags } from '@/hooks/use-tags'
import { useAppToast } from '@/hooks/use-app-toast'
import { TagPickerField } from './habit-form-fields/tag-picker-field'
import { TagEditorRow } from './habit-form-fields/tag-editor-row'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { createStyles } from './habit-form-fields/styles'

export function HabitDetailTags({ habit }: Readonly<{ habit: NormalizedHabit }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { tags } = useTags()
  const createTag = useCreateTag()
  const updateTag = useUpdateTag()
  const deleteTag = useDeleteTag()
  const assignTags = useAssignTags()
  const { showError } = useAppToast()
  const [editing, setEditing] = useState<HabitTag | 'new' | null>(null)
  const [name, setName] = useState('')
  const selectedIds = habit.tags.map((tag) => tag.id)
  const pending = createTag.isPending || updateTag.isPending || deleteTag.isPending || assignTags.isPending
  const report = (error: unknown) => showError(getFriendlyErrorMessage(error, (key) => t(key), 'toast.errors.validation', 'tag'))
  const assign = async (tagIds: string[]) => {
    try { await assignTags.mutateAsync({ habitId: habit.id, tagIds }) }
    catch (error) { report(error) }
  }
  const save = async () => {
    if (!editing) return
    try {
      const errorKey = await saveHabitDetailTag(editing, name, selectedIds, {
        create: (request) => createTag.mutateAsync(request),
        update: (request) => updateTag.mutateAsync(request),
        assign: (tagIds) => assignTags.mutateAsync({ habitId: habit.id, tagIds }),
      })
      if (errorKey) showError(t(errorKey))
      else setEditing(null)
    } catch (error) { report(error) }
  }
  const remove = async (id: string) => {
    try { await deleteTag.mutateAsync(id) }
    catch (error) { report(error) }
  }
  return <TagPickerField tags={tags} selectedIds={selectedIds} atLimit={selectedIds.length >= MAX_TAGS_PER_HABIT} disabled={pending}
    onToggle={(id) => { void assign(selectedIds.includes(id) ? selectedIds.filter((selectedId) => selectedId !== id) : [...selectedIds, id]) }}
    onCreate={() => { setEditing('new'); setName('') }} onEdit={(tag) => { setEditing(tag); setName(tag.name) }} onDelete={(id) => { void remove(id) }}
    editLabel={t('habits.form.editTag')} deleteLabel={t('habits.form.deleteTag')}
    editor={editing ? <TagEditorRow value={name} inputAriaLabel={t('habits.form.tagName')} cancelAriaLabel={t('common.cancel')} actionLabel={t(editing === 'new' ? 'common.add' : 'common.save')} disabled={pending} onChange={setName} onCommit={() => { void save() }} onCancel={() => setEditing(null)} tokens={tokens} styles={styles} /> : undefined} />
}

'use client'

import { useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'
import type { useEditorParent } from '@/hooks/use-editor-parent'
import { MoveParentOverlay } from './habit-list/move-parent-overlay'

/** The guided flow labels the row in the person's words under its question and asks the picker title as a question; the full form keeps the field noun. */
export function EditorParentField({ parent, disabled, guided, onRetryDetail }: Readonly<{ parent: ReturnType<typeof useEditorParent>; disabled: boolean; guided: boolean; onRetryDetail: () => void }>) {
  const t = useTranslations()
  const title = t(guided ? 'habits.flow.optional.parentRow' : 'habits.form.parentHabit')
  return <>
    <ListRow title={title} accessibilityLabel={`${title}, ${parent.value}`} value={parent.value} valueTextMode="personal" wrapValue placement="field" disabled={disabled} onClick={parent.show} />
    <MoveParentOverlay t={t} open={parent.open} isMoving={false} selectionOnly selectionTitle={t(guided ? 'habits.flow.optional.parentPicker' : 'habits.form.parentHabit')}
      movingHabitTitle={null} movingHabitParentId={parent.baseline}
      options={disabled ? [] : parent.options} selectedMoveParentId={parent.selected}
      inventoryState={parent.state} onRetryInventory={() => { void parent.retry(); onRetryDetail() }}
      canSubmit={false} onClose={parent.close} onConfirm={() => {}} onSelectOption={parent.select} />
  </>
}

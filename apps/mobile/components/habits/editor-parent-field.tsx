import { useTranslation } from 'react-i18next'
import { ListRow } from '@/components/ui/list-row'
import type { useEditorParent } from '@/hooks/use-editor-parent'
import { MoveParentDialog } from '../habit-list/move-parent-dialog'

export function EditorParentField({ parent, disabled, onRetryDetail }: Readonly<{ parent: ReturnType<typeof useEditorParent>; disabled: boolean; onRetryDetail: () => void }>) {
  const { t } = useTranslation()
  return <>
    <ListRow title={t('habits.form.parentHabit')} accessibilityLabel={`${t('habits.form.parentHabit')}, ${parent.value}`} value={parent.value} valueTextMode="personal" wrapValue placement="column" disabled={disabled} onClick={parent.show} />
    <MoveParentDialog t={t} visible={parent.open} isPending={false} selectionOnly
      movingHabitTitle={null} movingHabitParentId={parent.baseline}
      options={disabled ? [] : parent.options} selectedMoveParentId={parent.selected}
      inventoryState={parent.state} onRetryInventory={() => { void parent.retry(); onRetryDetail() }}
      canSubmit={false} onClose={parent.close} onConfirm={() => {}} onSelectOption={parent.select} />
  </>
}

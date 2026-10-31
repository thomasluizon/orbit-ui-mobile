import { useState } from 'react'
import type { ParentPromptChain } from '@orbit/shared/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { PersonalText } from '@/components/ui/personal-text'
import { StyleSheet, Text, View } from 'react-native'
import { useAppTheme } from '@/lib/use-app-theme'
import { createTokensV2 } from '@/lib/theme'
import { ConfirmSheet } from '@/components/ui/confirm-sheet'
import { plural } from '@/lib/plural'

interface HabitListConfirmDialogsProps {
  t: (key: string, params?: Record<string, unknown>) => string
  showDeleteConfirm: boolean
  deletePending: boolean
  deleteHabitName: string
  deleteDescendantCount: number
  duplicateHabitName: string | null
  parentPrompt: ParentPromptChain | null
  onSelectParentAncestor: (index: number, checked: boolean) => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onDeleteClosed: () => void
  onConfirmDuplicate: () => void
  onCancelDuplicate: () => void
  onConfirmParent: () => void
  onCancelParent: () => void
}

function ParentPromptConfirmation({ t, parentPrompt, onSelectParentAncestor, onConfirmParent, onCancelParent }: Readonly<Pick<HabitListConfirmDialogsProps, 't' | 'parentPrompt' | 'onSelectParentAncestor' | 'onConfirmParent' | 'onCancelParent'>>) {
  const [parentSheet, setParentSheet] = useState({ prompt: parentPrompt, closed: false })
  if (parentSheet.prompt?.habit.id !== parentPrompt?.habit.id && (!parentSheet.prompt || parentSheet.closed)) {
    setParentSheet({ prompt: parentPrompt, closed: false })
  }
  const sheetPrompt = parentSheet.prompt?.habit.id === parentPrompt?.habit.id ? parentPrompt : parentSheet.prompt
  const open = parentPrompt !== null && parentSheet.prompt?.habit.id === parentPrompt.habit.id
  const closed = () => setParentSheet((current) => ({ ...current, closed: true }))
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  return (
    <ConfirmSheet
      key={sheetPrompt?.habit.id ?? 'parent-prompt'}
      open={open}
      title={t(sheetPrompt?.mode === 'skip' ? 'habits.autoSkipParentTitle' : 'habits.autoLogParentTitle')}
      message={sheetPrompt && sheetPrompt.ancestors.length > 1 ? '' : t(sheetPrompt?.mode === 'skip' ? 'habits.autoSkipParentMessage' : 'habits.autoLogParentMessage', { name: sheetPrompt?.habit.title ?? '' })}
      confirmLabel={t(sheetPrompt && sheetPrompt.ancestors.length > 1 ? 'chat.pendingOp.action.applyChanges' : sheetPrompt?.mode === 'skip' ? 'habits.autoSkipParentConfirm' : 'habits.autoLogParentConfirm')}
      confirmDisabled={sheetPrompt?.selectedCount === 0}
      cancelLabel={t('common.notNow')}
      onCancel={() => { closed(); onCancelParent() }}
      onCloseComplete={closed}
      onConfirm={() => { closed(); onConfirmParent() }}
    >
      {sheetPrompt && sheetPrompt.ancestors.length > 1 ? (
        <View style={styles.ancestors}>
          {sheetPrompt.ancestors.map(({ habit, mode }, index) => (
            <View key={habit.id} style={styles.ancestor}>
              <Checkbox disabled={!open} checked={index < sheetPrompt.selectedCount} onChange={(checked) => onSelectParentAncestor(index, checked)} label={t(mode === 'skip' ? 'habits.autoSkipParentMessage' : 'habits.autoLogParentMessage', { name: habit.title })} />
              <View style={styles.ancestorLabel}>
                <PersonalText unclamped style={[styles.name, { color: tokens.fg1 }]}>{habit.title}</PersonalText>
                <Text style={[styles.action, { color: tokens.fg2 }]}>{t(mode === 'skip' ? 'habits.bulkSkipConfirm' : 'habits.bulkLogConfirm')}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </ConfirmSheet>
  )
}

export function HabitListConfirmDialogs({
  t,
  showDeleteConfirm,
  deletePending,
  deleteHabitName,
  deleteDescendantCount,
  duplicateHabitName,
  parentPrompt,
  onConfirmDelete,
  onCancelDelete,
  onDeleteClosed,
  onConfirmDuplicate,
  onCancelDuplicate,
  onConfirmParent,
  onSelectParentAncestor,
  onCancelParent,
}: Readonly<HabitListConfirmDialogsProps>) {
  return (
    <>
      <ConfirmSheet
        open={duplicateHabitName !== null}
        title={t('habits.duplicateConfirmTitle')}
        message={t('habits.duplicateConfirmMessage', { name: duplicateHabitName ?? '' })}
        confirmLabel={t('habits.duplicateConfirm')}
        onCancel={onCancelDuplicate}
        onConfirm={onConfirmDuplicate}
      />
      <ParentPromptConfirmation t={t} parentPrompt={parentPrompt} onSelectParentAncestor={onSelectParentAncestor} onConfirmParent={onConfirmParent} onCancelParent={onCancelParent} />
      <ConfirmSheet
        open={showDeleteConfirm}
        title={t('habits.deleteConfirmTitle')}
        message={plural(
          t('habits.deleteListConfirmMessage', {
            name: deleteHabitName,
            count: deleteDescendantCount,
          }),
          deleteDescendantCount,
        )}
        confirmLabel={t('habits.deleteHabit')}
        destructive
        confirmImmediately
        loading={deletePending}
        onCancel={onCancelDelete}
        onCloseComplete={onDeleteClosed}
        onConfirm={onConfirmDelete}
      />
    </>
  )
}

const styles = StyleSheet.create({
  ancestors: { gap: 8 },
  ancestor: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  ancestorLabel: { flex: 1, minWidth: 0, gap: 4, paddingVertical: 8 },
  name: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
  action: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 },
})

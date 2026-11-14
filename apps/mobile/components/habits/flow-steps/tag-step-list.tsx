import { useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { resolveMotionPreset } from '@orbit/shared/theme'
import type { HabitTag } from '@orbit/shared/types/habit'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { TagPickerRow } from '@/components/habits/habit-form-fields/tag-picker-field'
import { createStyles as createFormStyles } from '@/components/habits/habit-form-fields/styles'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { TagStepActions } from '@/hooks/use-tag-step-actions'
import { usePrefersReducedMotion } from '@/lib/motion'

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

/** A row enters with `list-enter` and leaves with `list-exit`. Under reduced motion it appears and goes at once. */
function TagRowMotion({ children }: Readonly<{ children: ReactNode }>) {
  const reduced = usePrefersReducedMotion()
  const enter = resolveMotionPreset('list-enter', reduced)
  const exit = resolveMotionPreset('list-exit', reduced)
  return (
    <Animated.View testID="tag-step-row"
      entering={reduced ? undefined : FadeIn.duration(enter.enterDuration).easing(Easing.bezier(...enter.enterEasing)).reduceMotion(ReduceMotion.System)}
      exiting={reduced ? undefined : FadeOut.duration(exit.exitDuration).easing(Easing.bezier(...exit.exitEasing)).reduceMotion(ReduceMotion.System)}>
      {children}
    </Animated.View>
  )
}

/** The rows of the free path: the search results, and every tag with its own rename and delete controls. */
export function TagStepRows({ tags, actions, query, managing, onPressTag }: Readonly<TagStepRowsProps>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const searching = query.trim().length > 0
  if (!managing && !searching) return null
  const rows = actions.availableTags.filter((tag) => matches(tag, query))
  const selected = new Set(tags.selectedTagIds)
  const initialName = actions.availableTags.find((tag) => tag.id === tags.editingTagId)?.name ?? ''
  return (
    <View testID="tag-step-rows" style={styles.rows}>
      {searching && rows.length === 0 ? <Text style={[styles.miss, { color: tokens.fg3 }]}>{t('habits.flow.tags.searchMiss')}</Text> : null}
      {rows.map((tag) => (
        <TagRowMotion key={tag.id}>
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
              styles={formStyles}
              tokens={tokens}
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
        </TagRowMotion>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  rows: { gap: 4 },
  miss: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
})

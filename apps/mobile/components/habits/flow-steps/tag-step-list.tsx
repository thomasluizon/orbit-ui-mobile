import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import type { HabitTag } from '@orbit/shared/types/habit'
import { TagEditorRow } from '@/components/habits/habit-form-fields/tag-editor-row'
import { TagPickerRow } from '@/components/habits/habit-form-fields/tag-picker-field'
import { createStyles as createFormStyles } from '@/components/habits/habit-form-fields/styles'
import { useThemeTokens } from '@/hooks/use-theme-tokens'
import type { TagSelectionState } from '@/hooks/use-tag-selection'
import type { TagStepActions } from '@/hooks/use-tag-step-actions'
import { useListRowMotion } from './list-row-motion'

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

type RowMotion = ReturnType<typeof useListRowMotion>

/**
 * The search words the rows show. A new query first commits the rows with no exit for one frame, then applies, so the
 * rows it hides leave at once, as web's list scope does. A delete under the same words keeps its exit.
 */
function useAppliedQuery(query: string) {
  const [applied, setApplied] = useState(query)
  useEffect(() => {
    if (applied === query) return
    const frame = requestAnimationFrame(() => setApplied(query))
    return () => cancelAnimationFrame(frame)
  }, [applied, query])
  return { applied, changing: applied !== query }
}

/**
 * A tag the person creates enters and a tag the person deletes fades out; the gap then closes at once, as on web. A
 * search moves no row.
 */
function TagRowMotion({ tagId, motion, changing, children }: Readonly<{ tagId: string; motion: RowMotion; changing: boolean; children: ReactNode }>) {
  return <Animated.View testID="tag-step-row" entering={motion.enteringFor(tagId)} exiting={changing ? undefined : motion.exiting}>{children}</Animated.View>
}

/** The rows of the free path: the search results, and every tag with its own rename and delete controls. */
export function TagStepRows({ tags, actions, query, managing, onPressTag }: Readonly<TagStepRowsProps>) {
  const { t } = useTranslation()
  const tokens = useThemeTokens()
  const formStyles = useMemo(() => createFormStyles(tokens), [tokens])
  const { applied, changing } = useAppliedQuery(query.trim())
  const searching = applied.length > 0
  const motion = useListRowMotion(actions.availableTags.map((tag) => tag.id), managing || searching)
  if (!managing && !searching) return null
  const rows = actions.availableTags.filter((tag) => matches(tag, applied))
  const selected = new Set(tags.selectedTagIds)
  const initialName = actions.availableTags.find((tag) => tag.id === tags.editingTagId)?.name ?? ''
  return (
    <View testID="tag-step-rows" style={styles.rows}>
      {searching && rows.length === 0 ? <Text style={[styles.miss, { color: tokens.fg3 }]}>{t('habits.flow.tags.searchMiss')}</Text> : null}
      {rows.map((tag) => (
        <TagRowMotion key={tag.id} tagId={tag.id} motion={motion} changing={changing}>
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

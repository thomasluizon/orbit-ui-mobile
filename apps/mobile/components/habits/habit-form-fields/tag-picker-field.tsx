import { useMemo, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Pencil, Trash2 } from '@/components/ui/icons'
import type { HabitTag } from '@orbit/shared/types/habit'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { BottomSheetAppTextInput } from '@/components/ui/bottom-sheet-app-text-input'
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'
import { KeyboardAwareFlatList } from '@/components/ui/keyboard-aware-scroll-view'

interface TagPickerFieldProps {
  tags: HabitTag[]
  selectedIds: string[]
  atLimit: boolean
  disabled: boolean
  editor?: ReactNode
  onToggle: (id: string) => void
  onCreate: () => void
  onEdit: (tag: HabitTag) => void
  onDelete: (id: string) => void
  editLabel: string
  deleteLabel: string
}

function TagPreview({ tags, moreLabel, styles }: Readonly<{ tags: HabitTag[]; moreLabel: string; styles: ReturnType<typeof createStyles> }>) {
  if (tags.length === 0) return null
  return <View style={styles.chips}>{tags.slice(0, 3).map((tag) => <View key={tag.id} style={styles.chip}><Text numberOfLines={1} style={styles.chipText}>{tag.name}</Text></View>)}{tags.length > 3 ? <View style={styles.chip}><Text style={styles.chipText}>{moreLabel}</Text></View> : null}</View>
}

export function TagPickerField({ tags, selectedIds, atLimit, disabled, editor, onToggle, onCreate, onEdit, onDelete, editLabel, deleteLabel }: Readonly<TagPickerFieldProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(
    () => createTokensV2(currentScheme, currentTheme),
    [currentScheme, currentTheme],
  )
  const styles = useMemo(() => createStyles(tokens), [tokens])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedTags = tags.filter((tag) => selectedSet.has(tag.id))
  const filtered = tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const renderTag = ({ item: tag }: { item: HabitTag }) => {
    const selected = selectedSet.has(tag.id)
    return <View style={styles.row}><Pressable accessibilityRole="button" accessibilityState={{ selected, disabled: disabled || (!selected && atLimit) }} disabled={disabled || (!selected && atLimit)} style={({ pressed }) => [styles.rowMain, disabled || (!selected && atLimit) ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onToggle(tag.id)}><Text numberOfLines={1} style={styles.rowTitle}>{tag.name}</Text><Text style={styles.rowValue}>{selected ? '✓' : ''}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${editLabel}: ${tag.name}`} disabled={disabled} style={({ pressed }) => [styles.iconButton, disabled ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onEdit(tag)}><Pencil size={16} color={tokens.fg3} strokeWidth={1.8} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel={`${deleteLabel}: ${tag.name}`} disabled={disabled} style={({ pressed }) => [styles.iconButton, disabled ? styles.disabled : null, pressed ? styles.pressed : null]} onPress={() => onDelete(tag.id)}><Trash2 size={16} color={tokens.fg3} strokeWidth={1.8} /></Pressable></View>
  }
  const trailingControls = <>
    {tags.length > 0 && !editor ? <Pressable accessibilityRole="button" style={styles.action} onPress={onCreate}><Text numberOfLines={1} style={styles.actionText}>{t('habits.form.newTag')}</Text></Pressable> : null}
    {editor}
  </>
  return <>
    <ListRow title={t('habits.form.tags')} value={t('habits.form.selectedCount', { count: selectedIds.length })} onClick={() => setOpen(true)} />
    <TagPreview tags={selectedTags} moreLabel={t('habits.form.moreSelected', { count: Math.max(0, selectedTags.length - 3) })} styles={styles} />
    {open ? <Sheet open title={t('habits.form.tags')} virtualizedBody={tags.length >= 21} onClose={() => { setOpen(false); setQuery('') }}><View style={styles.list}>
      {tags.length >= 8 ? <Text style={styles.count}>{t('habits.form.availableCount', { count: tags.length })}</Text> : null}
      {tags.length >= 21 ? <BottomSheetAppTextInput value={query} onChangeText={setQuery} placeholder={t('habits.form.searchTags')} style={styles.search} /> : null}
      {tags.length === 0 && !editor ? <View style={styles.empty}><Text numberOfLines={1} style={styles.emptyTitle}>{t('habits.form.noTags')}</Text><Pressable accessibilityRole="button" style={styles.action} onPress={onCreate}><Text numberOfLines={1} style={styles.actionText}>{t('habits.form.newTag')}</Text></Pressable></View> : null}
      {tags.length >= 21 ? <KeyboardAwareFlatList data={filtered} renderItem={renderTag} keyExtractor={(tag) => tag.id} style={styles.virtualList} initialNumToRender={8} windowSize={5} nestedScrollEnabled keyboardShouldPersistTaps="handled" ListFooterComponent={trailingControls} /> : <>{filtered.map((tag) => <View key={tag.id}>{renderTag({ item: tag })}</View>)}{trailingControls}</>}
    </View></Sheet> : null}
  </>
}

type Tokens = ReturnType<typeof createTokensV2>
function createStyles(tokens: Tokens) { return StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 }, chip: { backgroundColor: tokens.bgWell, borderRadius: 8, maxWidth: '100%', paddingHorizontal: 8, paddingVertical: 8 }, chipText: { color: tokens.fg2, flexShrink: 1, fontFamily: 'Geist_500Medium', fontSize: 13 },
  list: { gap: 4 }, count: { color: tokens.fg3, fontFamily: 'GeistMono_400Regular', fontSize: 12, padding: 8 }, search: { backgroundColor: tokens.bgField, borderColor: tokens.hairline, borderRadius: 12, borderWidth: 1, color: tokens.fg1, marginBottom: 8, minHeight: 44, paddingHorizontal: 12 }, virtualList: { maxHeight: 360 },
  row: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', minHeight: 48 }, rowMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12, minHeight: 48, paddingLeft: 12 }, rowTitle: { color: tokens.fg1, flex: 1, fontFamily: 'Geist_400Regular', fontSize: 16 }, rowValue: { color: tokens.fg3, fontSize: 14 }, iconButton: { alignItems: 'center', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 }, disabled: { opacity: 0.4 }, pressed: { backgroundColor: tokens.bgHover, transform: [{ scale: 0.96 }] },
  empty: { alignItems: 'center', gap: 16, padding: 32 }, emptyTitle: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 20, textAlign: 'center' }, action: { alignSelf: 'flex-start', backgroundColor: tokens.bgWell, borderRadius: 999, justifyContent: 'center', minHeight: 44, paddingHorizontal: 16 }, actionText: { color: tokens.fg1, fontFamily: 'Geist_500Medium', fontSize: 14 },
}) }

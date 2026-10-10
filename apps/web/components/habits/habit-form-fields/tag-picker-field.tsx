'use client'

import { PersonalTextDetails } from '@/components/ui/personal-text-details'
import { PickerRow } from '@/components/ui/picker-row'
import { PickerList } from '@/components/ui/picker-list'

import { useMemo, useState, type ReactNode } from 'react'
import type { HabitTag } from '@orbit/shared/types/habit'
import { useTranslations } from 'next-intl'
import { Pencil, Trash2 } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'

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

function TagPreview({ tags, moreLabel }: Readonly<{ tags: HabitTag[]; moreLabel: string }>) {
  if (tags.length === 0) return null
  return <div className="flex flex-wrap gap-2 pt-2">{tags.slice(0, 3).map((tag) => <div key={tag.id} className="min-w-0 max-w-full rounded-[8px] bg-[var(--bg-well)] text-sm font-medium text-[var(--fg-2)]"><PersonalTextDetails lines={1}>{tag.name}</PersonalTextDetails></div>)}{tags.length > 3 ? <span className="chip">{moreLabel}</span> : null}</div>
}

interface TagPickerListProps extends Omit<TagPickerFieldProps, 'selectedIds'> {
  selectedIds: Set<string>
}

function TagPickerRow({ tag, selected, atLimit, disabled, onToggle, onEdit, onDelete, editLabel, deleteLabel }: Readonly<{
  tag: HabitTag
  selected: boolean
  atLimit: boolean
  disabled: boolean
  onToggle: (id: string) => void
  onEdit: (tag: HabitTag) => void
  onDelete: (id: string) => void
  editLabel: string
  deleteLabel: string
}>) {
  return (
    <PickerRow
      name={tag.name}
      selected={selected}
      disabled={disabled || (!selected && atLimit)}
      onToggle={() => onToggle(tag.id)}
      value={selected ? '✓' : ''}
      valueHidden
      valueClassName="flex-1 text-sm text-[var(--fg-2)]"
      controlClassName="habit-control-motion flex min-h-12 w-full min-w-0 items-center rounded-[12px] px-2 py-1 text-left enabled:hover:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40"
      actionsClassName="flex items-center gap-2"
    >
      <button type="button" aria-label={`${editLabel}: ${tag.name}`} disabled={disabled} className="habit-control-motion grid size-[var(--touch-min)] shrink-0 place-items-center rounded-full text-[var(--fg-3)] enabled:hover:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40" onClick={() => onEdit(tag)}><Pencil size={16} strokeWidth={1.8} aria-hidden="true" /></button>
      <button type="button" aria-label={`${deleteLabel}: ${tag.name}`} disabled={disabled} className="habit-control-motion grid size-[var(--touch-min)] shrink-0 place-items-center rounded-full text-[var(--fg-3)] enabled:hover:bg-[var(--bg-hover)] active:scale-[0.96] disabled:opacity-40" onClick={() => onDelete(tag.id)}><Trash2 size={16} strokeWidth={1.8} aria-hidden="true" /></button>
    </PickerRow>
  )
}

function TagPickerList({ tags, selectedIds, atLimit, disabled, editor, onToggle, onCreate, onEdit, onDelete, editLabel, deleteLabel }: Readonly<TagPickerListProps>) {
  const t = useTranslations()
  const empty = !editor ? <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}><p className="max-w-full truncate text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noTags')}</p><button type="button" className="chip mt-2" onClick={onCreate}>{t('habits.form.newTag')}</button></div> : null
  return (
    <PickerList items={tags} getName={(tag) => tag.name} getKey={(tag) => tag.id} searchLabel={t('habits.form.searchTags')} empty={empty} renderRow={(tag) => <TagPickerRow tag={tag} selected={selectedIds.has(tag.id)} atLimit={atLimit} disabled={disabled} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} editLabel={editLabel} deleteLabel={deleteLabel} />}>
      {tags.length > 0 && !editor ? <button type="button" className="chip mt-2 self-start" onClick={onCreate}>{t('habits.form.newTag')}</button> : null}
      {editor}
    </PickerList>
  )
}

export function TagPickerField({ tags, selectedIds, atLimit, disabled, editor, onToggle, onCreate, onEdit, onDelete, editLabel, deleteLabel }: Readonly<TagPickerFieldProps>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedTags = tags.filter((tag) => selectedSet.has(tag.id))

  return (
    <>
      <ListRow title={t('habits.form.tags')} value={t('habits.form.selectedCount', { count: selectedIds.length })} placement="column" onClick={() => setOpen(true)} />
      <TagPreview tags={selectedTags} moreLabel={t('habits.form.moreSelected', { count: Math.max(0, selectedTags.length - 3) })} />
      {open ? <Sheet open virtualizedBody={tags.length >= 21} title={t('habits.form.tags')} onClose={() => setOpen(false)}>
        <TagPickerList tags={tags} selectedIds={selectedSet} atLimit={atLimit} disabled={disabled} editor={editor} onToggle={onToggle} onCreate={onCreate} onEdit={onEdit} onDelete={onDelete} editLabel={editLabel} deleteLabel={deleteLabel} />
      </Sheet> : null}
    </>
  )
}

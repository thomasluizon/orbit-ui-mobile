'use client'

import { useMemo, useState, type ReactNode } from 'react'
import type { HabitTag } from '@orbit/shared/types/habit'
import { useTranslations } from 'next-intl'
import { Pencil, Trash2 } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { Sheet } from '@/components/ui/sheet'

const VIRTUAL_ROW_HEIGHT = 48
const VIRTUAL_VIEWPORT_HEIGHT = 320
const VIRTUAL_OVERSCAN = 2

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
  return <div className="flex flex-wrap gap-2 pt-2">{tags.slice(0, 3).map((tag) => <span key={tag.id} className="chip max-w-full truncate">{tag.name}</span>)}{tags.length > 3 ? <span className="chip">{moreLabel}</span> : null}</div>
}

function VirtualSpacer({ rows }: Readonly<{ rows: number }>) {
  if (rows <= 0) return null
  return <div aria-hidden="true" style={{ height: rows * VIRTUAL_ROW_HEIGHT }} />
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
    <div className="orbit-list-row flex h-12 items-center rounded-[12px]">
      <button type="button" aria-pressed={selected} disabled={disabled || (!selected && atLimit)} className="habit-control-motion flex h-12 min-w-0 flex-1 items-center justify-between px-3 text-left active:scale-[0.96] disabled:opacity-40" onClick={() => onToggle(tag.id)}><span className="truncate">{tag.name}</span><span className="shrink-0 text-sm text-[var(--fg-3)]">{selected ? '✓' : ''}</span></button>
      <button type="button" aria-label={`${editLabel}: ${tag.name}`} disabled={disabled} className="habit-control-motion grid size-11 shrink-0 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40" onClick={() => onEdit(tag)}><Pencil size={16} strokeWidth={1.8} aria-hidden="true" /></button>
      <button type="button" aria-label={`${deleteLabel}: ${tag.name}`} disabled={disabled} className="habit-control-motion grid size-11 shrink-0 place-items-center rounded-full text-[var(--fg-3)] hover:text-[var(--status-bad)] active:scale-[0.96] disabled:opacity-40" onClick={() => onDelete(tag.id)}><Trash2 size={16} strokeWidth={1.8} aria-hidden="true" /></button>
    </div>
  )
}

function TagPickerList({ tags, selectedIds, atLimit, disabled, editor, onToggle, onCreate, onEdit, onDelete, editLabel, deleteLabel }: Readonly<TagPickerListProps>) {
  const t = useTranslations()
  const [query, setQuery] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const filtered = tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const virtualized = tags.length >= 21
  const start = virtualized ? Math.max(0, Math.floor(scrollTop / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN) : 0
  const size = Math.ceil(VIRTUAL_VIEWPORT_HEIGHT / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN * 2
  const visible = virtualized ? filtered.slice(start, start + size) : filtered
  const end = Math.min(filtered.length, start + visible.length)

  return (
    <div className="flex flex-col gap-1 p-2">
      {tags.length >= 8 ? <p className="px-3 py-1 text-xs text-[var(--fg-3)]">{t('habits.form.availableCount', { count: tags.length })}</p> : null}
      {virtualized ? <input value={query} onChange={(event) => { setQuery(event.target.value); setScrollTop(0) }} className="form-input mb-2" placeholder={t('habits.form.searchTags')} /> : null}
      {tags.length === 0 && !editor ? <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}><p className="text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noTags')}</p><button type="button" className="chip mt-2" onClick={onCreate}>{t('habits.form.newTag')}</button></div> : null}
      <div className={virtualized ? 'max-h-80 overflow-y-auto' : undefined} onScroll={virtualized ? (event) => setScrollTop(event.currentTarget.scrollTop) : undefined}>
        <VirtualSpacer rows={start} />
        {visible.map((tag) => <TagPickerRow key={tag.id} tag={tag} selected={selectedIds.has(tag.id)} atLimit={atLimit} disabled={disabled} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} editLabel={editLabel} deleteLabel={deleteLabel} />)}
        <VirtualSpacer rows={filtered.length - end} />
      </div>
      {tags.length > 0 && !editor ? <button type="button" className="chip mt-2 self-start" onClick={onCreate}>{t('habits.form.newTag')}</button> : null}
      {editor}
    </div>
  )
}

export function TagPickerField({ tags, selectedIds, atLimit, disabled, editor, onToggle, onCreate, onEdit, onDelete, editLabel, deleteLabel }: Readonly<TagPickerFieldProps>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedTags = tags.filter((tag) => selectedSet.has(tag.id))

  return (
    <>
      <ListRow title={t('habits.form.tags')} value={t('habits.form.selectedCount', { count: selectedIds.length })} onClick={() => setOpen(true)} />
      <TagPreview tags={selectedTags} moreLabel={t('habits.form.moreSelected', { count: Math.max(0, selectedTags.length - 3) })} />
      {open ? <Sheet open title={t('habits.form.tags')} onClose={() => setOpen(false)}>
        <TagPickerList tags={tags} selectedIds={selectedSet} atLimit={atLimit} disabled={disabled} editor={editor} onToggle={onToggle} onCreate={onCreate} onEdit={onEdit} onDelete={onDelete} editLabel={editLabel} deleteLabel={deleteLabel} />
      </Sheet> : null}
    </>
  )
}

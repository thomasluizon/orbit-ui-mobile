'use client'

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
  return <div className="flex flex-wrap gap-2 pt-2">{tags.slice(0, 3).map((tag) => <span key={tag.id} className="chip max-w-full truncate">{tag.name}</span>)}{tags.length > 3 ? <span className="chip">{moreLabel}</span> : null}</div>
}

export function TagPickerField({ tags, selectedIds, atLimit, disabled, editor, onToggle, onCreate, onEdit, onDelete, editLabel, deleteLabel }: Readonly<TagPickerFieldProps>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const selectedTags = tags.filter((tag) => selectedSet.has(tag.id))
  const filtered = tags.filter((tag) => tag.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))

  return (
    <>
      <ListRow inset={false} title={t('habits.form.tags')} value={t('habits.form.selectedCount', { count: selectedIds.length })} onClick={() => setOpen(true)} />
      <TagPreview tags={selectedTags} moreLabel={t('habits.form.moreSelected', { count: Math.max(0, selectedTags.length - 3) })} />
      {open ? <Sheet open title={t('habits.form.tags')} onClose={() => { setOpen(false); setQuery('') }}>
        <div className="flex flex-col gap-1 p-2">
          {tags.length >= 8 ? <p className="px-3 py-1 text-xs text-[var(--fg-3)]">{t('habits.form.availableCount', { count: tags.length })}</p> : null}
          {tags.length >= 21 ? <input value={query} onChange={(event) => setQuery(event.target.value)} className="form-input sticky top-0 z-10 mb-2" placeholder={t('habits.form.searchTags')} /> : null}
          {tags.length === 0 && !editor ? <div className="flex flex-col items-center px-6 py-8 text-center" style={{ gap: 12 }}><p className="text-xl font-medium text-[var(--fg-1)]">{t('habits.form.noTags')}</p><button type="button" className="chip mt-2" onClick={onCreate}>{t('habits.form.newTag')}</button></div> : null}
          <div className={tags.length >= 21 ? 'max-h-80 overflow-y-auto' : undefined}>
            {filtered.map((tag) => {
              const selected = selectedSet.has(tag.id)
              return <div key={tag.id} className="flex min-h-12 items-center rounded-[12px] transition-colors duration-[240ms] hover:bg-[var(--bg-hover)]" style={{ contentVisibility: tags.length >= 21 ? 'auto' : 'visible' }}><button type="button" aria-pressed={selected} disabled={disabled || (!selected && atLimit)} className="flex min-h-12 min-w-0 flex-1 items-center justify-between px-3 text-left active:scale-[0.96] disabled:opacity-40" onClick={() => onToggle(tag.id)}><span className="truncate">{tag.name}</span><span className="shrink-0 text-sm text-[var(--fg-3)]">{selected ? '✓' : ''}</span></button><button type="button" aria-label={`${editLabel}: ${tag.name}`} disabled={disabled} className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--fg-3)] transition-colors duration-[240ms] hover:text-[var(--fg-1)] active:scale-[0.96] disabled:opacity-40" onClick={() => onEdit(tag)}><Pencil size={16} strokeWidth={1.8} aria-hidden="true" /></button><button type="button" aria-label={`${deleteLabel}: ${tag.name}`} disabled={disabled} className="grid size-11 shrink-0 place-items-center rounded-full text-[var(--fg-3)] transition-colors duration-[240ms] hover:text-[var(--status-bad)] active:scale-[0.96] disabled:opacity-40" onClick={() => onDelete(tag.id)}><Trash2 size={16} strokeWidth={1.8} aria-hidden="true" /></button></div>
            })}
          </div>
          {tags.length > 0 && !editor ? <button type="button" className="chip mt-2 self-start" onClick={onCreate}>{t('habits.form.newTag')}</button> : null}
          {editor}
        </div>
      </Sheet> : null}
    </>
  )
}

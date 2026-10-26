'use client'

import { useId, useState, type ReactNode } from 'react'
import { HabitRowLeading } from '@/components/habits/habit-row-leading'
import { PersonalText } from '@/components/ui/personal-text'

export function HabitBlockRow({ title, emoji, meta, label, onOpen, disabled = false, control, expanded, proposed = false }: Readonly<{
  title: string
  emoji?: string | null
  proposed?: boolean
  expanded?: boolean
  meta?: string
  label?: string
  onOpen?: () => void
  disabled?: boolean
  control?: ReactNode
}>) {
  const textId = useId()
  const [disclosed, setDisclosed] = useState(false)
  const open = onOpen ?? (() => setDisclosed(!disclosed))
  const shownExpanded = onOpen ? expanded : disclosed
  const content = <><HabitRowLeading title={title} emoji={emoji ?? null} emojiSize={22} wellSize={46} wellRadius={16} /><span className="flex min-w-0 flex-1 flex-col gap-1"><PersonalText id={textId} expanded={shownExpanded} className={`text-base font-medium ${proposed ? 'text-[var(--fg-3)] group-hover/habit-block:text-[var(--fg-2)] group-active/habit-block:text-[var(--fg-2)]' : 'text-[var(--fg-1)]'}`}>{title}</PersonalText>{meta ? <span data-habit-block-meta="" className="text-xs text-[var(--fg-3)]">{meta}</span> : null}</span></>
  return <div data-habit-block-row="" className="flex min-w-0 items-center gap-2 rounded-[20px] bg-[var(--bg-card)] p-2">
     <button type="button" aria-label={label ?? title} aria-expanded={shownExpanded} aria-controls={shownExpanded == null ? undefined : textId} disabled={disabled} onClick={open} className="group/habit-block flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-[12px] border-0 bg-transparent text-start transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 disabled:opacity-60">{content}</button>
    {control ? <div className="flex shrink-0 items-center">{control}</div> : null}
  </div>
}

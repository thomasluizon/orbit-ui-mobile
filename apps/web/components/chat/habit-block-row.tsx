'use client'

import type { ReactNode } from 'react'
import { HabitRowLeading } from '@/components/habits/habit-row-leading'
import { PersonalText } from '@/components/ui/personal-text'

export function HabitBlockRow({ title, emoji, meta, label, onOpen, disabled = false, control, expanded }: Readonly<{
  title: string
  emoji?: string | null
  expanded?: boolean
  meta?: string
  label?: string
  onOpen?: () => void
  disabled?: boolean
  control?: ReactNode
}>) {
  const content = <><HabitRowLeading title={title} emoji={emoji ?? null} emojiSize={22} wellSize={46} wellRadius={16} /><span className="flex min-w-0 flex-1 flex-col gap-1"><PersonalText expanded={expanded} className="text-base font-medium text-[var(--fg-1)]">{title}</PersonalText>{meta ? <span className="text-xs text-[var(--fg-3)]">{meta}</span> : null}</span></>
  return <div data-habit-block-row="" className="flex min-w-0 items-center gap-2 rounded-[20px] bg-[var(--bg-card)] p-2">
    {onOpen ? <button type="button" aria-label={label ?? title} disabled={disabled} onClick={onOpen} className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2 rounded-[12px] border-0 bg-transparent text-start transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 disabled:opacity-60">{content}</button> : <div className="flex min-h-[48px] min-w-0 flex-1 items-center gap-2">{content}</div>}
    {control ? <div className="flex shrink-0 items-center">{control}</div> : null}
  </div>
}

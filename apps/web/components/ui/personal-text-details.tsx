'use client'

import { useId, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

export function PersonalTextDetails({ children, iconOnly = false, proposed = false }: Readonly<{ children: string; iconOnly?: boolean; proposed?: boolean }>) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const control = <button type="button" aria-label={children} aria-expanded={expanded} aria-controls={contentId} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }} onClick={() => setExpanded(!expanded)} style={{ color: proposed ? 'var(--fg-3)' : undefined }} className="orbit-hover-text flex min-h-12 min-w-12 w-full items-center gap-2 rounded-[12px] px-2 py-1 text-start touch-manipulation hover:bg-[var(--bg-hover)] hover:[--fg-3:var(--fg-2)] active:[--fg-3:var(--fg-2)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">
      {!iconOnly ? <PersonalText id={contentId} expanded={expanded} className="flex-1">{children}</PersonalText> : null}
      <ChevronDown aria-hidden="true" size={20} strokeWidth={2} className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} />
    </button>
  return <div className={iconOnly ? 'shrink-0 min-w-12' : 'min-w-0 w-full'}>
    {!iconOnly ? <PersonalTextAction label={children} contentClassName="flex min-h-12 min-w-12 w-full items-center gap-2 rounded-[12px] px-2 py-1 text-start" contentStyle={{ color: proposed ? 'var(--fg-3)' : undefined }} control={control} /> : control}
    {iconOnly && expanded ? <Sheet onClose={() => setExpanded(false)} title={children} titleMode="typed"><div id={contentId}><PersonalText expanded>{children}</PersonalText></div></Sheet> : null}
  </div>
}

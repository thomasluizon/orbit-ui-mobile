'use client'

import { useId, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'

export function PersonalTextDetails({ children, iconOnly = false }: Readonly<{ children: string; iconOnly?: boolean }>) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  return <div className={iconOnly ? 'shrink-0 min-w-12' : 'min-w-0 w-full'}>
    <button type="button" aria-label={children} aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded(!expanded)} className="orbit-hover-text flex min-h-12 min-w-12 w-full items-center gap-2 rounded-[12px] px-2 py-1 text-start touch-manipulation hover:bg-[var(--bg-hover)] focus-visible:outline focus-visible:outline-2">
      {!iconOnly ? <PersonalText id={contentId} expanded={expanded} className="flex-1">{children}</PersonalText> : null}
      <ChevronDown aria-hidden="true" size={20} strokeWidth={1.5} className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} />
    </button>
    {iconOnly && expanded ? <Sheet onClose={() => setExpanded(false)} title={children} titleMode="typed"><div id={contentId}><PersonalText expanded>{children}</PersonalText></div></Sheet> : null}
  </div>
}

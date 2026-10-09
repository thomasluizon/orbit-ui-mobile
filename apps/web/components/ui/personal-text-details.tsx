'use client'

import { useId, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Sheet } from '@/components/ui/sheet'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

export function PersonalTextDetails({ children, textStyle, lines = 2, iconOnly = false, proposed = false }: Readonly<{ children: string; textStyle?: CSSProperties; lines?: 1 | 2; iconOnly?: boolean; proposed?: boolean }>) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const control = <button type="button" aria-label={iconOnly ? t('common.showFullText', { name: children }) : children} aria-expanded={expanded} aria-controls={contentId} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }} onClick={() => setExpanded(!expanded)} style={{ ...textStyle, borderRadius: lines === 1 ? 8 : undefined, color: proposed ? 'var(--fg-3)' : textStyle?.color }} className="orbit-hover-text flex min-h-12 min-w-12 w-full items-center gap-2 rounded-[12px] px-2 py-1 text-start touch-manipulation hover:bg-[var(--bg-hover)] hover:[--fg-3:var(--fg-2)] active:[--fg-3:var(--fg-2)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">
      {!iconOnly ? <PersonalText lines={lines} id={contentId} expanded={expanded} className="flex-1">{children}</PersonalText> : null}
      <ChevronDown aria-hidden="true" size={20} strokeWidth={2} className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} />
    </button>
  return <div className={iconOnly ? 'shrink-0 min-w-12' : 'min-w-0 w-full'}>
    {!iconOnly ? <PersonalTextAction label={children} contentClassName="flex min-h-12 min-w-12 w-full items-center gap-2 rounded-[12px] px-2 py-1 text-start" contentStyle={{ ...textStyle, borderRadius: lines === 1 ? 8 : undefined, color: proposed ? 'var(--fg-3)' : textStyle?.color }} control={control} /> : control}
    {iconOnly && expanded ? <Sheet onClose={() => setExpanded(false)} title={children} titleMode="typed"><div id={contentId}><PersonalText expanded>{children}</PersonalText></div></Sheet> : null}
  </div>
}

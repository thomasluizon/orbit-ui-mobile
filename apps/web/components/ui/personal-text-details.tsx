'use client'

import { useId, useState, type CSSProperties } from 'react'
import { useTranslations } from 'next-intl'
import { Sheet } from '@/components/ui/sheet'
import { ChevronDown } from '@/components/ui/icons'
import { PersonalText } from '@/components/ui/personal-text'
import { PersonalTextAction } from '@/components/ui/personal-text-action'

function outsetPresentation(outset: boolean) {
  if (outset) return { className: '-mx-[8px]', textStyle: { paddingInline: 0 } }
  return { className: '', textStyle: undefined }
}

export function PersonalTextDetails({ children, textStyle, lines = 2, iconOnly = false, proposed = false, outset = false }: Readonly<{ children: string; textStyle?: CSSProperties; lines?: 1 | 2; iconOnly?: boolean; proposed?: boolean; outset?: boolean }>) {
  const t = useTranslations()
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  const presentation = outsetPresentation(outset)
  const control = <button type="button" aria-label={iconOnly ? t('common.showFullText', { name: children }) : children} aria-expanded={expanded} aria-controls={contentId} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation() }} onClick={() => setExpanded(!expanded)} style={{ ...textStyle, borderRadius: lines === 1 ? 8 : undefined, color: proposed ? 'var(--fg-3)' : textStyle?.color }} className="orbit-hover-text flex min-h-[48px] min-w-[48px] w-full items-center gap-[8px] rounded-[12px] px-[8px] py-[4px] text-start touch-manipulation hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)] hover:[--fg-3:var(--fg-2)] active:[--fg-3:var(--fg-2)] focus-visible:[--fg-3:var(--fg-2)] focus-visible:outline focus-visible:outline-2 transition-[background-color] duration-[var(--dur-hover-control)] ease-[var(--ease-standard)]">
      {!iconOnly ? <PersonalText lines={lines} id={contentId} expanded={expanded} className="flex-1" style={presentation.textStyle}>{children}</PersonalText> : null}
      <ChevronDown aria-hidden="true" size={20} strokeWidth={2} className={`shrink-0 ${expanded ? 'rotate-180' : ''}`} />
    </button>
  return <div className={iconOnly ? 'shrink-0 min-w-[48px]' : 'min-w-0 w-full'}>
    {!iconOnly ? <PersonalTextAction className={`${presentation.className} focus-within:[--fg-3:var(--fg-2)]`} label={children} contentClassName="flex min-h-[48px] min-w-[48px] w-full items-center gap-[8px] rounded-[12px] px-[8px] py-[4px] text-start" contentStyle={{ ...textStyle, borderRadius: lines === 1 ? 8 : undefined, color: proposed ? 'var(--fg-3)' : textStyle?.color }} control={control} /> : control}
    {iconOnly && expanded ? <Sheet onClose={() => setExpanded(false)} title={children} titleMode="typed"><div id={contentId}><PersonalText expanded>{children}</PersonalText></div></Sheet> : null}
  </div>
}

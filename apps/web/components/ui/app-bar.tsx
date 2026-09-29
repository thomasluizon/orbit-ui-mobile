'use client'

import type { Ref } from 'react'
import type { NavHeaderProps } from '@orbit/shared/contracts/navigation'
import { ChevronLeft } from '@/components/ui/icons'

/** The 44px round control in either header slot: back, or a trailing close. */
export const APP_BAR_CONTROL_CLASS =
  'orbit-pill-action flex size-11 items-center justify-center rounded-full text-[var(--fg-1)] hover:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.96]'

export function AppBar({ title, onBack, backLabel, action, titleIsHeading = true, titleIsBrandName = false, titleRef }: Readonly<NavHeaderProps & { titleIsHeading?: boolean; titleIsBrandName?: boolean; titleRef?: Ref<HTMLHeadingElement> }>) {
  const titleClassName = 'min-w-0 text-center font-mono text-[13px] font-medium uppercase tracking-[0.09em] text-[var(--fg-1)]'
  const titleTranslate = titleIsBrandName ? 'no' : undefined
  return (
    <header data-back={onBack ? true : undefined} className="grid h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-1 px-4">
      <div className="flex min-w-11 justify-start">
        {onBack && (
          <button type="button" aria-label={backLabel} onClick={onBack} className={APP_BAR_CONTROL_CLASS}>
            <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </div>
      {titleIsHeading ? <h1 ref={titleRef} tabIndex={-1} translate={titleTranslate} className={titleClassName}>{title}</h1> : <span translate={titleTranslate} className={titleClassName}>{title}</span>}
      <div className="flex min-w-11 items-center justify-end gap-3">{action}</div>
    </header>
  )
}

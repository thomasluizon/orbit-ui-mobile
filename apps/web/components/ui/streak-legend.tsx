'use client'

import { useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FreezeBankProps } from '@orbit/shared/contracts/display'
import { Info, Snowflake } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

export function StreakLegend({ words }: Readonly<Pick<FreezeBankProps, 'words'>>) {
  const t = useTranslations()
  const entryRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const { sheetRef } = useSheetHost()
  return (
    <div className="flex justify-start">
      <PillButton buttonRef={entryRef} variant="ghost" size="sm" minimumHeight={48} iconOnly label={words.legendLabel} expanded={open}
        onClick={() => setOpen(true)}>
        <Info size={24} strokeWidth={1.5} aria-hidden="true" />
      </PillButton>
      {open ? <Sheet ref={sheetRef} finalFocus={entryRef} open title={t('progressScreen.streak.legendTitle')} accessibleTitle={words.legendLabel} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4">
          {(['active', 'frozen', 'missed'] as const).map((state) => (
            <div key={state} className="flex min-h-[48px] items-center gap-3 text-[14px] text-[var(--fg-2)]">
              {state === 'frozen' ? <Snowflake size={16} strokeWidth={1.5} color="var(--status-frozen)" aria-hidden="true" />
                : <span aria-hidden="true" className="size-3 shrink-0 rounded-[8px]" style={state === 'active' ? { backgroundColor: 'var(--fg-1)' } : { boxShadow: 'inset 0 0 0 1px var(--status-empty)' }} />}
              <span>{words[state]}</span>
            </div>
          ))}
        </div>
      </Sheet> : null}
    </div>
  )
}

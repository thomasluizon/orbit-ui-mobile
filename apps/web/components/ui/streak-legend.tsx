'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { FreezeBankProps } from '@orbit/shared/contracts/display'
import { Info, Snowflake } from '@/components/ui/icons'
import { Sheet, useSheetHost } from '@/components/ui/sheet'

export function StreakLegend({ words }: Readonly<Pick<FreezeBankProps, 'words'>>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const { sheetRef } = useSheetHost()
  return (
    <div className="flex justify-start">
      <button type="button" aria-label={words.legendLabel} aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-[12px] text-[var(--fg-2)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]">
        <Info size={24} strokeWidth={1.5} aria-hidden="true" />
      </button>
      {open ? <Sheet ref={sheetRef} open title={t('progressScreen.streak.legendTitle')} accessibleTitle={words.legendLabel} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-4">
          {(['active', 'frozen', 'missed'] as const).map((state) => (
            <div key={state} className="flex min-h-[48px] items-center gap-3 text-[14px] text-[var(--fg-2)]">
              {state === 'frozen' ? <Snowflake size={16} strokeWidth={2} color="var(--status-frozen)" aria-hidden="true" />
                : <span aria-hidden="true" className="size-3 shrink-0 rounded-[8px]" style={state === 'active' ? { backgroundColor: 'var(--fg-1)' } : { boxShadow: 'inset 0 0 0 1px var(--status-empty)' }} />}
              <span>{words[state]}</span>
            </div>
          ))}
        </div>
      </Sheet> : null}
    </div>
  )
}

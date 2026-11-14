'use client'

import { useState } from 'react'
import { useLocale } from 'next-intl'
import { formatLocaleDate } from '@orbit/shared/utils'
import { DateField } from '@/components/ui/date-field'
import { X } from '@/components/ui/icons'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { FormSectionLabel } from './form-section-label'

interface EndDateEditorProps {
  visible: boolean
  disabled: boolean
  value: string
  onChange: (value: string) => void
  t: (key: string) => string
}

/** The end date of a repeat: add it, pick it in the calendar, and remove it. */
export function EndDateEditor({ visible, disabled, value, onChange, t }: Readonly<EndDateEditorProps>) {
  const locale = useLocale()
  const [focusRequest, setFocusRequest] = useState(0)
  const [endDateExpanded, setShowEndDate] = useState<boolean | null>(null)
  const showEndDate = endDateExpanded ?? Boolean(value)
  if (!visible) return null
  return (
    <section data-end-date-levels="" className="flex flex-col gap-4">
      <FormSectionLabel>{t('habits.form.ending')}</FormSectionLabel>
      <div><ListRow disabled={disabled} placement="field" title={t('habits.form.addEndDate')} value={value && !showEndDate ? formatLocaleDate(value, locale) : undefined} expanded={showEndDate} onClick={() => { if (!disabled) setShowEndDate(!showEndDate) }} /></div>
      {showEndDate ? <div className="flex flex-col gap-2">
      <FormSectionLabel>{t('habits.form.endDateQuestion')}</FormSectionLabel>
      <div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1"><DateField disabled={disabled} label={t('habits.form.endDateQuestion')} value={value} placeholder={t('habits.form.endDatePlaceholder')} onChange={(next) => { setShowEndDate(true); onChange(next) }} focusRequest={focusRequest} /></div>
      {value ? <div className="shrink-0">
        <PillButton disabled={disabled} variant="ghost" iconOnly label={t('habits.form.removeEndDate')} onClick={() => {
          setShowEndDate(true)
          onChange('')
          setFocusRequest((request) => request + 1)
        }}><X size={20} aria-hidden="true" /></PillButton>
      </div> : null}</div>
      </div> : null}
    </section>
  )
}

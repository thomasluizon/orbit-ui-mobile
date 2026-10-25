'use client'

import { X } from '@/components/ui/icons'

import { IconButton } from '@/components/ui/icon-button'

import { useTranslations } from 'next-intl'
import { PillButton } from '@/components/ui/pill-button'
import { ActionRow } from '@/components/ui/action-row'
import { OfflineRefusal } from '@/components/ui/offline-refusal'

export function HabitCreateActions({ presentation, pending, empty, subHabit, online, formId, onCancel }: Readonly<{
  presentation: 'sheet' | 'screen'
  pending: boolean
  empty: boolean
  subHabit: boolean
  online: boolean
  formId: string
  onCancel: () => void
}>) {
  const t = useTranslations()
  const screen = presentation === 'screen'
  const label = subHabit ? t('common.create') : t('habits.createHabit')
  const descriptionId = empty ? `${formId}-create-reason` : undefined
  const reason = empty ? <p id={`${formId}-create-reason`} className={`text-sm text-[var(--fg-3)]${screen ? ' text-center sm:text-start' : ''}`}>{t('habits.form.createWhy')}</p> : null
  return <div className={online ? 'flex w-full flex-col' : 'flex w-full flex-col gap-4'}>
    <div role="status">{!online ? <OfflineRefusal icon="create" title={t('offline.create.title')} reason={t('offline.create.reason')} /> : null}</div>
    <div className={screen ? 'flex flex-col gap-2' : 'flex flex-col gap-4'}>
      {!screen ? reason : null}
      {screen ? (
        <PillButton size="md" formId={formId}
          descriptionId={descriptionId} loading={pending}>
          {label}
        </PillButton>
      ) : (
        <ActionRow>
          <IconButton label={t('common.cancel')} disabled={pending} onClick={onCancel}><X size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>
          <PillButton size="sm" formId={formId}
          descriptionId={descriptionId} loading={pending}>
          {label}
        </PillButton>
        </ActionRow>
      )}
      {screen ? reason : null}
    </div>
  </div>
}

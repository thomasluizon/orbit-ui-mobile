'use client'

import type { AppToastItem } from '@orbit/shared/stores'
import { useTranslations } from 'next-intl'
import { useAppToastStore } from '@/stores/app-toast-store'
import { ActionRow } from './action-row'
import { ErrorState } from './error-state'
import { PillButton } from './pill-button'
import { IconButton } from './icon-button'
import { X } from './icons'

export function ModalErrorNotice({ item }: Readonly<{ item: AppToastItem }>) {
  const t = useTranslations()
  const dismissToast = useAppToastStore(state => state.dismissToast)
  const triggerAction = useAppToastStore(state => state.triggerAction)
  return <ErrorState message={item.toast.message} action={<ActionRow>
    {item.toast.actionLabel ? <PillButton size="sm" onClick={() => triggerAction(item.id)}>{item.toast.actionLabel}</PillButton> : null}
    <IconButton label={t('common.close')} onClick={() => dismissToast(item.id)}><X size={20} aria-hidden="true" /></IconButton>
  </ActionRow>} />
}

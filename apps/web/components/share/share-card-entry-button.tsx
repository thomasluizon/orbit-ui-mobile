'use client'

import { IconButton } from '@/components/ui/icon-button'

import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'

import { Share2 } from '@/components/ui/icons'
import { ShareCardSheet } from './share-card-sheet'

export function ShareCardEntryButton({ variant = 'row' }: Readonly<{ variant?: 'row' | 'button' }>) {
  const t = useTranslations()
  const [open, setOpen] = useAccountScopedState(false)
  return <>
    {variant === 'row'
      ? <ListRow compact textMode="label" chevron={false} icon={<Share2 size={24} strokeWidth={1.8} />} title={t('shareCard.entry')} onClick={() => setOpen(true)} />
      : <IconButton label={t('shareCard.entry')} onClick={() => setOpen(true)}><Share2 size={20} strokeWidth={1.5} aria-hidden="true" /></IconButton>}
    {open ? <ShareCardSheet onClose={() => setOpen(false)} /> : null}
  </>
}

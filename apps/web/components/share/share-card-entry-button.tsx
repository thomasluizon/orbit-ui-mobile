'use client'

import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'
import { PillButton } from '@/components/ui/pill-button'
import { Share2 } from '@/components/ui/icons'
import { ShareCardSheet } from './share-card-sheet'

export function ShareCardEntryButton({ variant = 'row' }: Readonly<{ variant?: 'row' | 'button' }>) {
  const t = useTranslations()
  const [open, setOpen] = useAccountScopedState(false)
  return <>
    {variant === 'row'
      ? <ListRow compact textMode="label" icon={<Share2 size={24} strokeWidth={1.8} />} title={t('shareCard.entry')} onClick={() => setOpen(true)} />
      : <PillButton variant="ghost" onClick={() => setOpen(true)} leadingIcon={<Share2 size={16} strokeWidth={2} aria-hidden="true" />}>{t('shareCard.entry')}</PillButton>}
    {open ? <ShareCardSheet onClose={() => setOpen(false)} /> : null}
  </>
}

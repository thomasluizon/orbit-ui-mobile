'use client'

import { useState } from 'react'
import { Share2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'
import { ShareCardPanel } from './share-card-panel'

interface ShareCardEntryButtonProps {
  variant?: 'row' | 'chip'
  displayName?: string
}

/** Opens the recap share sheet. `row` renders a profile action row; `chip` renders a kit chip for the retrospective header. */
export function ShareCardEntryButton({
  variant = 'row',
  displayName,
}: Readonly<ShareCardEntryButtonProps>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <>
      {variant === 'row' ? (
        <ListRow
          icon={<Share2 size={24} strokeWidth={1.8} color="var(--fg-1)" />}
          title={t('shareCard.entry')}
          chevron={false}
          onClick={() => setOpen(true)}
        />
      ) : (
        <button
          type="button"
          className="chip"
          onClick={() => setOpen(true)}
          aria-label={t('shareCard.entry')}
        >
          <Share2 size={16} strokeWidth={1.8} aria-hidden="true" />
        </button>
      )}
      <ShareCardPanel open={open} onOpenChange={setOpen} displayName={displayName} />
    </>
  )
}

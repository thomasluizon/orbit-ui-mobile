'use client'

import { useState } from 'react'
import { Share2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { ListRow } from '@/components/ui/list-row'
import { ShareCardPanel } from './share-card-panel'

interface ShareCardEntryButtonProps {
  displayName?: string
}

/** Opens the recap share sheet from the profile action row. */
export function ShareCardEntryButton({
  displayName,
}: Readonly<ShareCardEntryButtonProps>) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <>
      <ListRow
        icon={<Share2 size={24} strokeWidth={1.8} color="var(--fg-1)" />}
        title={t('shareCard.entry')}
        chevron={false}
        onClick={() => setOpen(true)}
      />
      <ShareCardPanel open={open} onOpenChange={setOpen} displayName={displayName} />
    </>
  )
}

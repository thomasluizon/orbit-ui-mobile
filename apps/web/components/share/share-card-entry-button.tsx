'use client'

import { useState } from 'react'
import { Share2 } from '@/components/ui/icons'
import { useTranslations } from 'next-intl'
import { ProfileActionButton } from '@/app/(app)/profile/_components/profile-action-button'
import { ShareCardSheet } from './share-card-sheet'

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
        <ProfileActionButton icon={Share2} onClick={() => setOpen(true)} label={t('shareCard.entry')} dataTestId="share-card-open" />
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
      <ShareCardSheet open={open} onOpenChange={setOpen} displayName={displayName} />
    </>
  )
}

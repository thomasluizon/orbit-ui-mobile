'use client'

import type { ReactElement } from 'react'
import type { EmptyStateProps } from '@orbit/shared/contracts/feedback'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'

export function ChatEmptyState({ browseAction, mascotState }: Readonly<{ browseAction?: ReactElement; mascotState?: EmptyStateProps['mascotState'] }>) {
  const t = useTranslations()

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[708px] flex-col justify-center-safe" aria-live="off">
      <EmptyState title={t('chat.empty.title')} action={browseAction} mascotState={mascotState} disclosure={
        <p
          className="m-0 self-center text-center"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--fg-3)',
            maxWidth: 300,
            lineHeight: 1.4,
          }}
        >
          {t('aiDisclosure.notMedicalAdvice')}
        </p>
      } />
    </div>
  )
}

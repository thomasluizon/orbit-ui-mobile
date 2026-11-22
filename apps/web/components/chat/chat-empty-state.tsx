'use client'

import type { ReactElement } from 'react'
import type { EmptyStateProps } from '@orbit/shared/contracts/feedback'
import { useTranslations } from 'next-intl'
import { EmptyState } from '@/components/ui/empty-state'
import { useFlag } from '@/hooks/use-flag'

/** The empty thread. With the guided flows on, a thread that rests (offline or at the message limit) gives the reason in one Orbit line under Orbit. */
export function ChatEmptyState({ browseAction, mascotState, restReason }: Readonly<{ browseAction?: ReactElement; mascotState?: EmptyStateProps['mascotState']; restReason?: 'todayOrbit.guided.offline' | 'conversation.restLimit' | null }>) {
  const t = useTranslations()
  const guided = useFlag('orbit_guided_flows')

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[708px] flex-col justify-center-safe" aria-live="off">
      <EmptyState title={t('chat.empty.title')} line={guided && restReason ? t(restReason) : undefined} action={browseAction} mascotState={mascotState} disclosure={
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

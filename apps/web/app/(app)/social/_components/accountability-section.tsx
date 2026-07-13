'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Loader2, UserPlus } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionLabel } from '@/components/ui/section-label'
import { PillButton } from '@/components/ui/pill-button'
import { useAccountabilityPairs } from '@/hooks/use-accountability'
import { BuddyInviteRow } from './buddy-invite-row'
import { BuddyRow } from './buddy-row'
import { NewPairFlow } from './new-pair-flow'
import { PairDetail } from './pair-detail'

interface AccountabilitySectionProps {
  initialHabitId?: string | null
}

/** Buddies tab: invites, active pairs, a New-pair flow, and the tap-through pair detail overlay. */
export function AccountabilitySection({ initialHabitId }: Readonly<AccountabilitySectionProps>) {
  const t = useTranslations()
  const { data, isLoading, isError, refetch } = useAccountabilityPairs()
  const [newPairOpen, setNewPairOpen] = useState(() => Boolean(initialHabitId))
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null)

  const activePairs = data?.activePairs ?? []
  const incoming = data?.incomingInvites ?? []
  const outgoing = data?.outgoingInvites ?? []

  const renderActivePairs = () => {
    if (isLoading) {
      return (
        <div
          role="status"
          aria-label={t('common.loading')}
          className="flex justify-center"
          style={{ padding: '48px 0' }}
        >
          <Loader2 className="size-[22px] animate-spin" style={{ color: 'var(--primary)' }} />
        </div>
      )
    }
    if (isError) {
      return (
        <EmptyState
          description={t('social.errors.loadFailed')}
          action={{
            label: t('common.retry'),
            onClick: () => void refetch(),
            variant: 'secondary',
          }}
        />
      )
    }
    if (activePairs.length === 0) {
      return (
        <EmptyState
          title={t('social.buddies.emptyTitle')}
          description={t('social.buddies.emptyBody')}
          action={{
            label: t('social.buddies.newPairCta'),
            onClick: () => setNewPairOpen(true),
            variant: 'secondary',
          }}
        />
      )
    }
    return (
      <div className="stagger-enter">
        {activePairs.map((pair) => (
          <BuddyRow key={pair.id} pair={pair} onOpen={setSelectedPairId} />
        ))}
      </div>
    )
  }

  return (
    <>
      <div>
        <div style={{ padding: '16px 20px 8px' }}>
          <PillButton
            onClick={() => setNewPairOpen(true)}
            leading={<UserPlus size={18} strokeWidth={1.8} />}
          >
            {t('social.buddies.newPairCta')}
          </PillButton>
        </div>

        {incoming.length > 0 && (
          <div>
            <SectionLabel>{t('social.buddies.incomingTitle')}</SectionLabel>
            {incoming.map((pair) => (
              <BuddyInviteRow key={pair.id} pair={pair} direction="incoming" />
            ))}
          </div>
        )}

        {outgoing.length > 0 && (
          <div>
            <SectionLabel>{t('social.buddies.outgoingTitle')}</SectionLabel>
            {outgoing.map((pair) => (
              <BuddyInviteRow key={pair.id} pair={pair} direction="outgoing" />
            ))}
          </div>
        )}
      </div>

      <div
        className="flex flex-col"
        style={{ gap: 4, paddingBottom: 24 }}
      >
        <SectionLabel>{t('social.buddies.activeTitle')}</SectionLabel>
        {renderActivePairs()}
      </div>

      <NewPairFlow open={newPairOpen} onOpenChange={setNewPairOpen} initialHabitId={initialHabitId} />
      <PairDetail pairId={selectedPairId} onClose={() => setSelectedPairId(null)} />
    </>
  )
}

'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { UserPlus } from 'lucide-react'
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
  const { data } = useAccountabilityPairs()
  const [newPairOpen, setNewPairOpen] = useState(() => Boolean(initialHabitId))
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null)

  const activePairs = data?.activePairs ?? []
  const incoming = data?.incomingInvites ?? []
  const outgoing = data?.outgoingInvites ?? []

  return (
    <div className="flex flex-col" style={{ gap: 4, paddingBottom: 24 }}>
      <div style={{ padding: '16px 20px 8px' }}>
        <PillButton
          onClick={() => setNewPairOpen(true)}
          fullWidth
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

      <SectionLabel>{t('social.buddies.activeTitle')}</SectionLabel>
      {activePairs.length === 0 ? (
        <div className="flex flex-col items-center px-8 py-10 text-center" style={{ gap: 8 }}>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 600, color: 'var(--fg-1)' }}>
            {t('social.buddies.emptyTitle')}
          </p>
          <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-3)' }}>
            {t('social.buddies.emptyBody')}
          </p>
        </div>
      ) : (
        activePairs.map((pair) => (
          <BuddyRow key={pair.id} pair={pair} onOpen={setSelectedPairId} />
        ))
      )}

      <NewPairFlow open={newPairOpen} onOpenChange={setNewPairOpen} initialHabitId={initialHabitId} />
      <PairDetail pairId={selectedPairId} onClose={() => setSelectedPairId(null)} />
    </div>
  )
}

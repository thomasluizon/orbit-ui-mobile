'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { AppOverlay } from '@/components/ui/app-overlay'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { useProfile } from '@/hooks/use-profile'
import { useChallenges } from '@/hooks/use-challenges'
import { SocialOptInGate } from '../_components/social-opt-in-gate'
import { ChallengeList } from './_components/challenge-list'
import { CreateChallengeForm } from './_components/create-challenge-form'
import { JoinByCodeForm } from './_components/join-by-code-form'

export default function ChallengesPage() {
  const t = useTranslations()
  const router = useRouter()
  const searchParams = useSearchParams()
  const deepLinkCode = searchParams.get('code') ?? ''
  const { profile, isLoading } = useProfile()
  const socialEnabled = profile?.socialOptIn ?? false
  const { data: challenges } = useChallenges({ enabled: socialEnabled })
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(deepLinkCode.length > 0)

  const openDetail = (id: string) => router.push(`/social/challenges/${id}`)

  return (
    <div className="relative">
      <div className="md:hidden">
        <GradientTop height={160} />
      </div>
      <div className="relative z-[1]">
        <AppBar back onBack={() => router.back()} title={t('challenges.title')} />
        {isLoading ? null : !socialEnabled ? (
          <SocialOptInGate />
        ) : (
          <>
            <div className="flex" style={{ gap: 8, padding: '8px 20px 4px' }}>
              <PillButton onClick={() => setCreateOpen(true)}>
                {t('challenges.actions.create')}
              </PillButton>
              <PillButton variant="ghost" onClick={() => setJoinOpen(true)}>
                {t('challenges.actions.join')}
              </PillButton>
            </div>
            <ChallengeList
              challenges={challenges ?? []}
              onOpen={openDetail}
              onCreate={() => setCreateOpen(true)}
              onJoin={() => setJoinOpen(true)}
            />
          </>
        )}
      </div>

      <AppOverlay open={createOpen} onOpenChange={setCreateOpen} title={t('challenges.create.title')}>
        <CreateChallengeForm
          onCreated={(id) => {
            setCreateOpen(false)
            openDetail(id)
          }}
        />
      </AppOverlay>

      <AppOverlay open={joinOpen} onOpenChange={setJoinOpen} title={t('challenges.join.title')}>
        <JoinByCodeForm initialCode={deepLinkCode} onJoined={() => setJoinOpen(false)} />
      </AppOverlay>
    </div>
  )
}

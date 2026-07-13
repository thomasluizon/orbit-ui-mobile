'use client'

import { useMemo, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { AppOverlay } from '@/components/ui/app-overlay'
import { GradientTop } from '@/components/ui/gradient-top'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useTopbarSlot } from '@/components/shell/topbar-slot'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { useChallenges } from '@/hooks/use-challenges'
import { ChallengesContent } from './_components/challenges-content'
import { ChallengesTopbarHeading } from './_components/challenges-topbar-heading'
import { CreateChallengeForm } from './_components/create-challenge-form'
import { JoinByCodeForm } from './_components/join-by-code-form'

export default function ChallengesPage() {
  return (
    <Suspense fallback={null}>
      <ChallengesPageContent />
    </Suspense>
  )
}

function ChallengesPageContent() {
  const t = useTranslations()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const isDesktop = useIsDesktop()
  const searchParams = useSearchParams()
  const deepLinkCode = searchParams.get('code') ?? ''
  const { profile, isLoading } = useProfile()
  const socialEnabled = profile?.socialOptIn ?? false
  const { data: challenges, isError, refetch } = useChallenges({ enabled: socialEnabled })
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(deepLinkCode.length > 0)

  const openDetail = (id: string) => router.push(`/social/challenges/${id}`)

  const topbarHeadingRow = useMemo(
    () =>
      isDesktop && (profile?.socialOptIn ?? false) ? (
        <ChallengesTopbarHeading
          onCreate={() => setCreateOpen(true)}
          onJoin={() => setJoinOpen(true)}
        />
      ) : null,
    [isDesktop, profile?.socialOptIn],
  )
  useTopbarSlot(topbarHeadingRow)

  return (
    <div className="relative">
      <div className="md:hidden">
        <GradientTop height={200} />
      </div>
      <div className="relative z-[1]">
        <AppBar back onBack={() => goBackOrFallback('/social')} title={t('challenges.title')} />
        <ChallengesContent
          isLoading={isLoading}
          socialEnabled={socialEnabled}
          isError={isError}
          challenges={challenges ?? []}
          onRetry={() => void refetch()}
          onOpen={openDetail}
          onCreate={() => setCreateOpen(true)}
          onJoin={() => setJoinOpen(true)}
        />
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

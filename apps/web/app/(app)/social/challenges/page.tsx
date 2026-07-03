'use client'

import { useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { AppOverlay } from '@/components/ui/app-overlay'
import { GradientTop } from '@/components/ui/gradient-top'
import { PillButton } from '@/components/ui/pill-button'
import { useIsDesktop } from '@/hooks/use-is-desktop'
import { useTopbarSlot } from '@/components/shell/topbar-slot'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { useChallenges } from '@/hooks/use-challenges'
import { SocialOptInGate } from '../_components/social-opt-in-gate'
import { ChallengeList } from './_components/challenge-list'
import { CreateChallengeForm } from './_components/create-challenge-form'
import { JoinByCodeForm } from './_components/join-by-code-form'

export default function ChallengesPage() {
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
      isDesktop && socialEnabled ? (
        <div className="flex min-w-0 flex-1 items-center justify-between" style={{ gap: 12 }}>
          <h1 className="t-h2 truncate">{t('challenges.title')}</h1>
          <div className="flex shrink-0 items-center" style={{ gap: 8 }}>
            <PillButton onClick={() => setCreateOpen(true)}>
              {t('challenges.actions.create')}
            </PillButton>
            <PillButton variant="ghost" onClick={() => setJoinOpen(true)}>
              {t('challenges.actions.join')}
            </PillButton>
          </div>
        </div>
      ) : null,
    [isDesktop, socialEnabled, t],
  )
  useTopbarSlot(topbarHeadingRow)

  return (
    <div className="relative">
      <div className="md:hidden">
        <GradientTop height={200} />
      </div>
      <div className="relative z-[1]">
        <AppBar back onBack={() => goBackOrFallback('/social')} title={t('challenges.title')} />
        {isLoading ? (
          <div
            role="status"
            aria-label={t('common.loading')}
            className="flex justify-center"
            style={{ padding: 48, color: 'var(--fg-3)' }}
          >
            <Loader2 className="animate-spin" size={22} aria-hidden="true" />
          </div>
        ) : !socialEnabled ? (
          <SocialOptInGate />
        ) : isError ? (
          <div className="flex flex-col items-center px-8 py-12 text-center" style={{ gap: 12 }}>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-sans)',
                fontSize: 14,
                lineHeight: 1.5,
                color: 'var(--fg-3)',
              }}
            >
              {t('challenges.errors.loadFailed')}
            </p>
            <PillButton variant="ghost" onClick={() => void refetch()}>
              {t('common.retry')}
            </PillButton>
          </div>
        ) : (
          <>
            <div className="flex md:hidden" style={{ gap: 8, padding: '8px 20px 4px' }}>
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

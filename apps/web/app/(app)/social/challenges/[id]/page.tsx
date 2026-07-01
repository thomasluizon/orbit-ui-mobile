'use client'

import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { ChallengeDetail } from '../_components/challenge-detail'

export default function ChallengeDetailPage() {
  const t = useTranslations()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''

  return (
    <div className="relative">
      <div className="md:hidden">
        <GradientTop height={160} />
      </div>
      <div className="relative z-[1]">
        <AppBar back onBack={() => router.back()} title={t('challenges.title')} />
        <ChallengeDetail challengeId={id} onLeft={() => router.replace('/social/challenges')} />
      </div>
    </div>
  )
}

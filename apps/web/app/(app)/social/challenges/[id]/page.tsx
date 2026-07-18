'use client'

import { useParams, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { AppBar } from '@/components/ui/app-bar'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useTopbarHeading } from '@/components/shell/topbar-slot'
import { ChallengeDetail } from '../_components/challenge-detail'

export default function ChallengeDetailPage() {
  const t = useTranslations()
  useTopbarHeading({ ownedByPage: true })
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const params = useParams<{ id: string }>()
  const id = typeof params.id === 'string' ? params.id : ''

  return (
    <div className="relative">
      <div className="relative z-[1]">
        <AppBar
          back
          onBack={() => goBackOrFallback('/social/challenges')}
          title={t('challenges.title')}
        />
        <ChallengeDetail challengeId={id} onLeft={() => router.replace('/social/challenges')} />
      </div>
    </div>
  )
}

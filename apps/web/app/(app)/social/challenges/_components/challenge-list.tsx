'use client'

import { useTranslations } from 'next-intl'
import type { ChallengeListItem } from '@orbit/shared/types/challenge'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { SectionLabel } from '@/components/ui/section-label'
import { ChallengeCard } from './challenge-card'

interface ChallengeListProps {
  challenges: ChallengeListItem[]
  onOpen: (id: string) => void
  onCreate: () => void
  onJoin: () => void
}

/** Partitions the caller's challenges into Active and Completed sections; shows create/join CTAs when empty. */
export function ChallengeList({ challenges, onOpen, onCreate, onJoin }: Readonly<ChallengeListProps>) {
  const t = useTranslations()
  const active = challenges.filter((challenge) => challenge.status === 'Active')
  const completed = challenges.filter((challenge) => challenge.status === 'Completed')

  if (challenges.length === 0) {
    return (
      <div className="flex flex-col items-center px-8 py-12 text-center" style={{ gap: 12 }}>
        <SatelliteGlyph />
        <p style={{ margin: 0, fontFamily: 'var(--font-sans)', fontSize: 17, fontWeight: 500, color: 'var(--fg-1)' }}>
          {t('challenges.empty.title')}
        </p>
        <p style={{ margin: 0, maxWidth: 360, fontFamily: 'var(--font-sans)', fontSize: 14, lineHeight: 1.5, color: 'var(--fg-3)' }}>
          {t('challenges.empty.body')}
        </p>
        <div className="flex w-full flex-col" style={{ gap: 8, maxWidth: 320, marginTop: 4 }}>
          <PillButton fullWidth onClick={onCreate}>
            {t('challenges.empty.create')}
          </PillButton>
          <PillButton variant="ghost" className="self-center" onClick={onJoin}>
            {t('challenges.empty.join')}
          </PillButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col" style={{ paddingBottom: 24 }}>
      {active.length > 0 ? (
        <>
          <SectionLabel>{t('challenges.sections.active')}</SectionLabel>
          <div className="stagger-enter flex flex-col" style={{ gap: 10, padding: '0 20px' }}>
            {active.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : null}

      {completed.length > 0 ? (
        <>
          <SectionLabel>{t('challenges.sections.completed')}</SectionLabel>
          <div className="stagger-enter flex flex-col" style={{ gap: 10, padding: '0 20px' }}>
            {completed.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} onOpen={onOpen} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

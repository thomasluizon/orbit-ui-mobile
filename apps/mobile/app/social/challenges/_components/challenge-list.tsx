import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import type { ChallengeListItem } from '@orbit/shared/types/challenge'
import { PillButton } from '@/components/ui/pill-button'
import { SatelliteGlyph } from '@/components/ui/satellite-glyph'
import { SectionLabel } from '@/components/ui/section-label'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ChallengeCard } from './challenge-card'

interface ChallengeListProps {
  challenges: ChallengeListItem[]
  onOpen: (id: string) => void
  onCreate: () => void
  onJoin: () => void
}

/** Partitions the caller's challenges into Active and Completed sections; shows create/join CTAs when empty. */
export function ChallengeList({ challenges, onOpen, onCreate, onJoin }: Readonly<ChallengeListProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const active = challenges.filter((challenge) => challenge.status === 'Active')
  const completed = challenges.filter((challenge) => challenge.status === 'Completed')

  if (challenges.length === 0) {
    return (
      <View style={styles.empty}>
        <SatelliteGlyph size={96} />
        <Text style={[styles.emptyTitle, { color: tokens.fg1 }]}>{t('challenges.empty.title')}</Text>
        <Text style={[styles.emptyBody, { color: tokens.fg3 }]}>{t('challenges.empty.body')}</Text>
        <View style={styles.emptyActions}>
          <PillButton fullWidth onPress={onCreate}>
            {t('challenges.empty.create')}
          </PillButton>
          <PillButton fullWidth variant="ghost" onPress={onJoin}>
            {t('challenges.empty.join')}
          </PillButton>
        </View>
      </View>
    )
  }

  return (
    <View>
      {active.length > 0 ? (
        <>
          <SectionLabel>{t('challenges.sections.active')}</SectionLabel>
          <View style={styles.cards}>
            {active.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} onOpen={onOpen} />
            ))}
          </View>
        </>
      ) : null}

      {completed.length > 0 ? (
        <>
          <SectionLabel>{t('challenges.sections.completed')}</SectionLabel>
          <View style={styles.cards}>
            {completed.map((challenge) => (
              <ChallengeCard key={challenge.id} challenge={challenge} onOpen={onOpen} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 48, gap: 12 },
  emptyTitle: { fontFamily: 'Rubik_500Medium', fontSize: 17, textAlign: 'center' },
  emptyBody: { fontFamily: 'Rubik_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  emptyActions: { width: '100%', maxWidth: 320, gap: 8, marginTop: 4 },
  cards: { gap: 10, paddingHorizontal: 20 },
})

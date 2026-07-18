import { useState, type ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { UserPlus } from '@/components/ui/icons'
import { EmptyState } from '@/components/ui/empty-state'
import { SectionLabel } from '@/components/ui/section-label'
import { PillButton } from '@/components/ui/pill-button'
import { useAccountabilityPairs } from '@/hooks/use-accountability'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { BuddyInviteRow } from './buddy-invite-row'
import { BuddyRow } from './buddy-row'
import { NewPairFlow } from './new-pair-flow'

interface AccountabilitySectionProps {
  initialHabitId?: string | null
}

function rowEntrance(index: number) {
  return FadeInDown.duration(280)
    .delay(Math.min(index, 8) * 40)
    .reduceMotion(ReduceMotion.System)
}

/** Buddies tab: invites, active pairs, and a New-pair flow. Pair detail opens as a full-screen route. */
export function AccountabilitySection({ initialHabitId }: Readonly<AccountabilitySectionProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { data, isLoading, isError, refetch } = useAccountabilityPairs()
  const [newPairOpen, setNewPairOpen] = useState(() => Boolean(initialHabitId))

  const activePairs = data?.activePairs ?? []
  const incoming = data?.incomingInvites ?? []
  const outgoing = data?.outgoingInvites ?? []

  let pairsContent: ReactNode
  if (isLoading) {
    pairsContent = (
      <View style={styles.loading}>
        <ActivityIndicator color={tokens.primary} accessibilityLabel={t('common.loading')} />
      </View>
    )
  } else if (isError) {
    pairsContent = (
      <EmptyState
        description={t('social.errors.loadFailed')}
        action={{
          label: t('common.retry'),
          onPress: () => void refetch(),
          variant: 'secondary',
        }}
      />
    )
  } else if (activePairs.length === 0) {
    pairsContent = (
      <EmptyState
        title={t('social.buddies.emptyTitle')}
        description={t('social.buddies.emptyBody')}
        action={{
          label: t('social.buddies.newPairCta'),
          onPress: () => setNewPairOpen(true),
          variant: 'secondary',
        }}
      />
    )
  } else {
    pairsContent = activePairs.map((pair, index) => (
      <Animated.View key={pair.id} entering={rowEntrance(index)}>
        <BuddyRow pair={pair} />
      </Animated.View>
    ))
  }

  return (
    <View style={styles.container}>
      <View style={styles.ctaBlock}>
        <PillButton
          onPress={() => setNewPairOpen(true)}
          leading={<UserPlus size={18} strokeWidth={1.8} color={tokens.fgOnPrimary} />}
        >
          {t('social.buddies.newPairCta')}
        </PillButton>
      </View>

      {incoming.length > 0 ? (
        <View>
          <SectionLabel>{t('social.buddies.incomingTitle')}</SectionLabel>
          {incoming.map((pair) => (
            <BuddyInviteRow key={pair.id} pair={pair} direction="incoming" />
          ))}
        </View>
      ) : null}

      {outgoing.length > 0 ? (
        <View>
          <SectionLabel>{t('social.buddies.outgoingTitle')}</SectionLabel>
          {outgoing.map((pair) => (
            <BuddyInviteRow key={pair.id} pair={pair} direction="outgoing" />
          ))}
        </View>
      ) : null}

      <SectionLabel>{t('social.buddies.activeTitle')}</SectionLabel>
      {pairsContent}

      <NewPairFlow
        open={newPairOpen}
        onClose={() => setNewPairOpen(false)}
        initialHabitId={initialHabitId}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingBottom: 24 },
  ctaBlock: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8, alignItems: 'flex-start' },
  loading: { alignItems: 'center', paddingVertical: 48 },
})

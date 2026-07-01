import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { UserPlus } from 'lucide-react-native'
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

/** Buddies tab: invites, active pairs, and a New-pair flow. Pair detail opens as a full-screen route. */
export function AccountabilitySection({ initialHabitId }: Readonly<AccountabilitySectionProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { data } = useAccountabilityPairs()
  const [newPairOpen, setNewPairOpen] = useState(() => Boolean(initialHabitId))

  const activePairs = data?.activePairs ?? []
  const incoming = data?.incomingInvites ?? []
  const outgoing = data?.outgoingInvites ?? []

  return (
    <View style={styles.container}>
      <View style={styles.ctaBlock}>
        <PillButton
          onPress={() => setNewPairOpen(true)}
          fullWidth
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
      {activePairs.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{t('social.buddies.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('social.buddies.emptyBody')}</Text>
        </View>
      ) : (
        activePairs.map((pair) => <BuddyRow key={pair.id} pair={pair} />)
      )}

      <NewPairFlow
        open={newPairOpen}
        onClose={() => setNewPairOpen(false)}
        initialHabitId={initialHabitId}
      />
    </View>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    container: { paddingBottom: 24 },
    ctaBlock: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    empty: { alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40, gap: 8 },
    emptyTitle: {
      fontFamily: 'Rubik_600SemiBold',
      fontSize: 17,
      color: tokens.fg1,
      textAlign: 'center',
    },
    emptyBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      color: tokens.fg3,
      textAlign: 'center',
    },
  })
}

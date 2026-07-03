import { useState } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppBar } from '@/components/ui/app-bar'
import { GradientTop } from '@/components/ui/gradient-top'
import { SectionHeadTabs } from '@/components/ui/section-head-tabs'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { SocialOptInGate } from './social/_components/social-opt-in-gate'
import { SocialIdentityBar } from './social/_components/social-identity-bar'
import { SocialFeed } from './social/_components/social-feed'
import { SocialFriends } from './social/_components/social-friends'
import { AccountabilitySection } from './social/_components/accountability-section'
import { ChallengesEntryCard } from './social/_components/challenges-entry-card'
import { CheerComposer, type CheerTarget } from './social/_components/cheer-composer'
import { InviteConfirmSheet } from './social/_components/invite-confirm-sheet'

type SocialTab = 'feed' | 'friends' | 'buddies'

const REFERRAL_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/

export default function SocialScreen() {
  const { t } = useTranslation()
  const goBackOrFallback = useGoBackOrFallback()
  const router = useRouter()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { profile, isLoading } = useProfile()
  const { tab: tabParam, newPairHabitId, invite: inviteParam } = useLocalSearchParams<{
    tab?: string
    newPairHabitId?: string
    invite?: string
  }>()
  const inviteCode =
    typeof inviteParam === 'string' && REFERRAL_CODE_PATTERN.test(inviteParam) ? inviteParam : null
  const [tab, setTab] = useState<SocialTab>(
    tabParam === 'buddies' || tabParam === 'friends' ? tabParam : 'feed',
  )
  const [cheerTarget, setCheerTarget] = useState<CheerTarget | null>(null)

  const socialEnabled = profile?.socialOptIn ?? false
  const tabs = [
    { id: 'feed' as const, label: t('social.tabs.feed') },
    { id: 'friends' as const, label: t('social.tabs.friends') },
    { id: 'buddies' as const, label: t('social.tabs.buddies') },
  ]

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <GradientTop height={200} />
      <AppBar
        back
        onBack={() => goBackOrFallback('/profile')}
        title={t('social.title')}
        backLabel={t('common.goBack')}
      />
      {isLoading ? null : !socialEnabled ? (
        <SocialOptInGate />
      ) : (
        <>
          <SectionHeadTabs tabs={tabs} active={tab} onChange={setTab} ariaLabel={t('social.title')} />
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <SocialIdentityBar />
            <ChallengesEntryCard />
            {tab === 'feed' ? (
              <SocialFeed onCheer={setCheerTarget} onAddFriends={() => setTab('friends')} />
            ) : tab === 'friends' ? (
              <SocialFriends onCheer={setCheerTarget} />
            ) : (
              <AccountabilitySection initialHabitId={newPairHabitId ?? null} />
            )}
          </ScrollView>
        </>
      )}
      <CheerComposer target={cheerTarget} onClose={() => setCheerTarget(null)} />
      <InviteConfirmSheet
        code={inviteCode}
        onClose={() => router.setParams({ invite: undefined })}
      />
    </SafeAreaView>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.bg },
    scroll: { paddingBottom: 40 },
  })
}

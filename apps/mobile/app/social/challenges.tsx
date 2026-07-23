import { useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'
import { AppBar } from '@/components/ui/app-bar'
import { BottomSheetModal } from '@/components/bottom-sheet-modal'
import { PillButton } from '@/components/ui/pill-button'
import { SkeletonLine } from '@/components/ui/skeleton'
import { useGoBackOrFallback } from '@/hooks/use-go-back-or-fallback'
import { useProfile } from '@/hooks/use-profile'
import { useSheetExitAction } from '@/hooks/use-sheet-exit-action'
import { useChallenges } from '@/hooks/use-challenges'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { SocialOptInGate } from './_components/social-opt-in-gate'
import { ChallengeList } from './challenges/_components/challenge-list'
import { CreateChallengeForm } from './challenges/_components/create-challenge-form'
import { JoinByCodeForm } from './challenges/_components/join-by-code-form'

export default function ChallengesScreen() {
  const { t } = useTranslation()
  const router = useRouter()
  const goBackOrFallback = useGoBackOrFallback()
  const params = useLocalSearchParams<{ code?: string }>()
  const deepLinkCode = typeof params.code === 'string' ? params.code : ''
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const styles = createStyles(tokens)
  const { profile, isLoading } = useProfile()
  const socialEnabled = profile?.socialOptIn ?? false
  const { data: challenges, isError, refetch } = useChallenges({ enabled: socialEnabled })
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(deepLinkCode.length > 0)
  const { scheduleExitAction, runExitAction } = useSheetExitAction()

  const openDetail = (id: string) => router.push(`/social/challenges/${id}`)

  let challengesContent: ReactNode
  if (isLoading) {
    challengesContent = (
      <View
        style={styles.skeletonList}
        accessibilityRole="progressbar"
        accessibilityLabel={t('common.loading')}
      >
        {[0, 1, 2].map((index) => (
          <View key={index} style={styles.skeletonCard}>
            <SkeletonLine width={96} height={20} />
            <SkeletonLine width="66%" height={16} />
            <SkeletonLine width="40%" height={12} />
          </View>
        ))}
      </View>
    )
  } else if (!socialEnabled) {
    challengesContent = <SocialOptInGate />
  } else if (isError) {
    challengesContent = (
      <View style={styles.errorBlock}>
        <Text style={[styles.errorBody, { color: tokens.fg3 }]}>
          {t('challenges.errors.loadFailed')}
        </Text>
        <PillButton
          variant="ghost"
          onPress={() => {
            void refetch()
          }}
        >
          {t('common.retry')}
        </PillButton>
      </View>
    )
  } else {
    challengesContent = (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.actions}>
          <PillButton style={styles.actionButton} onPress={() => setCreateOpen(true)}>
            {t('challenges.actions.create')}
          </PillButton>
          <PillButton style={styles.actionButton} variant="ghost" onPress={() => setJoinOpen(true)}>
            {t('challenges.actions.join')}
          </PillButton>
        </View>
        <ChallengeList
          challenges={challenges ?? []}
          onOpen={openDetail}
          onCreate={() => setCreateOpen(true)}
          onJoin={() => setJoinOpen(true)}
        />
      </ScrollView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <AppBar
        back
        onBack={() => goBackOrFallback('/social')}
        title={t('challenges.title')}
        backLabel={t('common.goBack')}
      />
      {challengesContent}

      <BottomSheetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onDidDismiss={runExitAction}
        title={t('challenges.create.title')}
        snapPoints={['70%', '92%']}
        contentManagesScroll
      >
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <CreateChallengeForm
            onCreated={(id) => {
              scheduleExitAction(() => openDetail(id))
              setCreateOpen(false)
            }}
          />
        </ScrollView>
      </BottomSheetModal>

      <BottomSheetModal
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        title={t('challenges.join.title')}
        snapPoints={['60%', '90%']}
        contentManagesScroll
      >
        <ScrollView contentContainerStyle={styles.sheet} keyboardShouldPersistTaps="handled">
          <JoinByCodeForm initialCode={deepLinkCode} onJoined={() => setJoinOpen(false)} />
        </ScrollView>
      </BottomSheetModal>
    </SafeAreaView>
  )
}

function createStyles(tokens: ReturnType<typeof createTokensV2>) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: tokens.bg },
    scroll: { paddingBottom: 40 },
    skeletonList: { paddingHorizontal: 20, paddingTop: 8, gap: 10 },
    skeletonCard: {
      padding: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: tokens.hairline,
      backgroundColor: tokens.bgCard,
      gap: 10,
    },
    errorBlock: { paddingHorizontal: 32, paddingVertical: 48, alignItems: 'center', gap: 12 },
    errorBody: {
      fontFamily: 'Rubik_400Regular',
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
    actionButton: { flex: 1 },
    sheet: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 32 },
  })
}

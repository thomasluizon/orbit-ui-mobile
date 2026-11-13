import { Modal, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'
import {
  extractBackendStatus,
  formatStreakRepairDates,
  getStreakRepairErrorMessageKey,
  type StreakRepairState,
} from '@orbit/shared/utils'
import { OptionCard } from '@/components/ui/option-card'
import { OrbitOverlayLayer } from '@/components/ui/orbit-overlay-layer'
import { QuestionFlow } from '@/components/ui/question-flow'
import type { useRepairStreak } from '@/hooks/use-gamification'
import { usePrefersReducedMotion } from '@/lib/motion'
import { captureGuidedFlowCompleted } from '@/lib/posthog'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

const REPAIR_STEP = 'repair'

/**
 * The repair as a one-question flow over Sequência: the question states what the repair does and what it costs,
 * and the quick options are the answers. It sends the same request as the confirm it replaces. An error keeps
 * the flow open. Android back closes it.
 */
export function StreakRepairFlow({ state, repair, onClose, onRepaired }: Readonly<{
  state: StreakRepairState
  repair: ReturnType<typeof useRepairStreak>
  onClose: () => void
  onRepaired: (currentStreak: number) => void
}>) {
  const { t, i18n } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const reducedMotion = usePrefersReducedMotion()
  const status = extractBackendStatus(repair.error)
  const submit = () => {
    if (repair.isPending) return
    repair.mutate(state.dates, {
      onSuccess: (streakInfo) => {
        captureGuidedFlowCompleted('streak_repair', 1, false)
        onRepaired(streakInfo.currentStreak)
      },
    })
  }
  return (
    <Modal visible animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={onClose}>
      <OrbitOverlayLayer>
        <SafeAreaView style={[styles.root, { backgroundColor: tokens.bg }]}>
          <View testID="streak-repair-flow" style={styles.root}>
            <QuestionFlow
              flow="streak_repair"
              stepKey={REPAIR_STEP}
              position={1}
              total={1}
              direction={1}
              question={t('progressScreen.streak.repairFlow.question', { count: state.count })}
              line={t('progressScreen.streak.repairFlow.line', { dates: formatStreakRepairDates(state.dates, i18n.language) })}
              progressLabel={t('habits.flow.progress', { position: 1, total: 1 })}
              backLabel={t('common.back')}
              closeLabel={t('common.close')}
              onClose={onClose}
              statusText={repair.isPending ? t('progressScreen.streak.repairFlow.saving') : undefined}
              options={<>
                <OptionCard label={t('progressScreen.streak.repairFlow.repair')} selected={repair.isPending} onSelect={submit} />
                <OptionCard label={t('progressScreen.streak.repairFlow.notNow')} onSelect={onClose} />
              </>}
            >
              {repair.isError && status !== 409 ? <Text accessibilityRole="alert" style={[styles.error, { color: tokens.statusBadText }]}>{t(getStreakRepairErrorMessageKey(status))}</Text> : null}
            </QuestionFlow>
          </View>
        </SafeAreaView>
      </OrbitOverlayLayer>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20, textAlign: 'center' },
})

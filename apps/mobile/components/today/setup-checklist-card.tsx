import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getSetupChecklist } from '@orbit/shared/utils'
import { useAccountScopedState } from '@/hooks/use-session-reset'
import { useProfile } from '@/hooks/use-profile'
import { useUIPreferencesReadiness, useUIStore } from '@/stores/ui-store'
import { Check, Circle, X } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { createTokensV2, radius } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function SetupChecklistCard() {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { profile } = useProfile()
  const dismissed = useUIStore((state) => state.setupChecklistDismissed)
  const setDismissed = useUIStore((state) => state.setSetupChecklistDismissed)
  const preferencesReady = useUIPreferencesReadiness((state) => state.ready)
  const [pending, setPending] = useAccountScopedState(false)
  const [failed, setFailed] = useAccountScopedState(false)
  const checklist = getSetupChecklist(profile)

  async function dismiss() {
    if (pending) return
    setPending(true)
    setFailed(false)
    try {
      await setDismissed(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  if (!preferencesReady || !checklist || (dismissed && !pending)) return null

  return (
    <View style={[styles.card, { backgroundColor: tokens.bgCard }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t('today.setupChecklist.title')}</Text>
          <Text style={[styles.label, { color: tokens.fg2 }]}>{checklist.done === checklist.items.length ? t('today.setupChecklist.complete') : t('today.setupChecklist.subtitle')}</Text>
        </View>
        <PillButton variant="ghost" iconOnly label={t('today.setupChecklist.dismiss')} loading={pending} onClick={() => void dismiss()}>
          <X size={20} strokeWidth={1.5} color={tokens.fg2} />
        </PillButton>
      </View>
      <View style={styles.items}>
        {checklist.items.map((item) => {
          return <View key={item.key} accessible accessibilityLabel={`${t(`today.setupChecklist.items.${item.key}`)}${item.done ? `, ${t('habits.completed')}` : ''}`} style={styles.item}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.indicator, item.done ? { backgroundColor: tokens.fg1 } : null]}>
              {item.done ? <Check size={16} strokeWidth={2} color={tokens.bg} /> : <Circle size={20} strokeWidth={1.5} color={tokens.trackEmpty} />}
            </View>
            <Text style={[styles.label, { color: tokens.fg2 }]}>{t(`today.setupChecklist.items.${item.key}`)}</Text>
          </View>
        })}
      </View>
      <View style={{ gap: failed ? 12 : 0 }}>
        <Text accessibilityLiveRegion="polite" style={[styles.progress, { color: tokens.fg3 }]}>{t('today.setupChecklist.progress', { done: checklist.done, total: checklist.items.length })}</Text>
        <View accessibilityLiveRegion="polite">{failed ? <Text style={[styles.label, { color: tokens.statusBadText }]}>{t('today.setupChecklist.dismissError')}</Text> : null}</View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { gap: 24, borderRadius: radius.xl, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 },
  headerText: { flex: 1, gap: 8 },
  title: { fontFamily: 'Geist_500Medium', fontSize: 20, lineHeight: 26 },
  items: { gap: 12 },
  indicator: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  label: { flexShrink: 1, fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 21 },
  progress: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] },
})

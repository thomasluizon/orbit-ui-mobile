import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getOnboardingRemindCopy, getOnboardingReminderPreviewTime, type OnboardingRemindState } from '@orbit/shared/utils'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export function OnboardingRemind({ state, title, dueTime, isLive }: Readonly<{ state: OnboardingRemindState; title: string; dueTime: string; isLive: boolean }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const prefix = 'onboarding.flow.remind'
  const { titleKey, bodyKey } = getOnboardingRemindCopy(state, isLive)
  if (state !== 'ask') {
    return <View style={styles.root}><Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(`${prefix}.${titleKey}`)}</Text><Text style={[styles.body, { color: tokens.fg2 }]}>{t(`${prefix}.${bodyKey}`)}</Text></View>
  }
  return <View style={styles.root}><View style={styles.intro}><Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(`${prefix}.${titleKey}`)}</Text><Text style={[styles.body, { color: tokens.fg2 }]}>{t(`${prefix}.${bodyKey}`)}</Text></View><View style={styles.preview}><View style={[styles.notification, { backgroundColor: tokens.bgWell }]}><View style={styles.notificationHeader}><OrbitMark size={16} /><Text style={[styles.orbit, { color: tokens.fg3 }]}>Orbit</Text><View style={styles.spacer} /><Text style={[styles.time, { color: tokens.fg3 }]}>{getOnboardingReminderPreviewTime(dueTime)}</Text></View><Text style={[styles.habit, { color: tokens.fg1 }]}>{title}</Text><Text style={[styles.note, { color: tokens.fg2 }]}>{t(`${prefix}.notificationBody`)}</Text></View><Text style={[styles.fine, { color: tokens.fg3 }]}>{t(`${prefix}.fine`)}</Text></View></View>
}
const styles = StyleSheet.create({ root: { gap: 24 }, intro: { gap: 12 }, preview: { gap: 8 }, title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, letterSpacing: -0.44, lineHeight: 26 }, body: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26 }, notification: { borderRadius: 12, gap: 4, padding: 16 }, notificationHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 }, orbit: { fontFamily: 'GeistMono_400Regular', fontSize: 12 }, spacer: { flex: 1 }, habit: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 22 }, note: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 }, time: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] }, fine: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 18 } })

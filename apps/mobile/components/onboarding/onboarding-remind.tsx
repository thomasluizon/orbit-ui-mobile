import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { getOnboardingReminderPreviewTime } from '@orbit/shared/utils'
import { OrbitMark } from '@/components/ui/orbit-mark'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export type ReminderState = 'ask' | 'denied' | 'refused' | 'unsupported' | 'failed' | 'no-time'
function getMessageKeys(state: Exclude<ReminderState, 'ask'>): readonly [string, string] {
  if (state === 'denied') return ['deniedTitle', 'deniedBody']
  if (state === 'refused') return ['refusedTitle', 'refusedBody']
  if (state === 'unsupported') return ['unsupportedTitle', 'unsupportedBody']
  if (state === 'failed') return ['failedTitle', 'failedBody']
  return ['noTimeTitle', 'noTimeBody']
}
export function OnboardingRemind({ state, title, dueTime }: Readonly<{ state: ReminderState; title: string; dueTime: string }>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = useMemo(() => createTokensV2(currentScheme, currentTheme), [currentScheme, currentTheme])
  const prefix = 'onboarding.flow.remind'
  if (state !== 'ask') {
    const keys = getMessageKeys(state)
    return <View style={styles.root}><Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(`${prefix}.${keys[0]}`)}</Text><Text style={[styles.body, { color: tokens.fg2 }]}>{t(`${prefix}.${keys[1]}`)}</Text></View>
  }
  return <View style={styles.root}><View><Text accessibilityRole="header" style={[styles.title, { color: tokens.fg1 }]}>{t(`${prefix}.title`)}</Text><Text style={[styles.body, { color: tokens.fg2 }]}>{t(`${prefix}.body`)}</Text></View><View style={[styles.notification, { backgroundColor: tokens.bgWell }]}><View style={styles.notificationHeader}><OrbitMark size={16} /><Text style={[styles.orbit, { color: tokens.fg3 }]}>Orbit</Text><View style={styles.spacer} /><Text style={[styles.time, { color: tokens.fg3 }]}>{getOnboardingReminderPreviewTime(dueTime)}</Text></View><Text style={[styles.habit, { color: tokens.fg1 }]}>{title}</Text><Text style={[styles.note, { color: tokens.fg2 }]}>{t(`${prefix}.notificationBody`)}</Text></View><Text style={[styles.fine, { color: tokens.fg3 }]}>{t(`${prefix}.fine`)}</Text></View>
}
const styles = StyleSheet.create({ root: { gap: 24 }, title: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 22, letterSpacing: -0.44, lineHeight: 26 }, body: { fontFamily: 'Geist_400Regular', fontSize: 17, lineHeight: 26, marginTop: 12 }, notification: { borderRadius: 12, gap: 4, padding: 16 }, notificationHeader: { alignItems: 'center', flexDirection: 'row', gap: 8 }, orbit: { fontFamily: 'GeistMono_400Regular', fontSize: 12 }, spacer: { flex: 1 }, habit: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 22 }, note: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 20 }, time: { fontFamily: 'GeistMono_400Regular', fontSize: 12, fontVariant: ['tabular-nums'] }, fine: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 18 } })

import { StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { PADDING } from '@orbit/shared/theme'
import { Lock } from '@/components/ui/icons'
import { PillButton } from '@/components/ui/pill-button'
import { ProBadge } from '@/components/ui/pro-badge'
import type { AppTokensV2 } from '@/lib/theme'
import { buildUpgradeHref } from '@/lib/upgrade-route'
import { progressStyles } from './progress-styles'

export function LockedCard({ title, body, action, tokens }: Readonly<{ title: string; body: string; action: string; tokens: AppTokensV2 }>) {
  const router = useRouter()
  return (
    <View testID="progress-locked-card" style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}>
      <View style={styles.lockHeader}><Lock size={20} strokeWidth={2} color={tokens.fg2} /><ProBadge alwaysVisible /></View>
      <View style={styles.copy}><Text style={[styles.cardTitle, { color: tokens.fg1 }]}>{title}</Text><Text style={[progressStyles.body, { color: tokens.fg3 }]}>{body}</Text></View>
      <View style={progressStyles.actionStart}><PillButton variant="ghost" size="sm" onClick={() => router.push(buildUpgradeHref('/progress'))}>{action}</PillButton></View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, gap: 12, padding: PADDING.recordInset },
  cardTitle: { fontFamily: 'Geist_500Medium', fontSize: 16, lineHeight: 20 },
  copy: { gap: 4 },
  lockHeader: { alignItems: 'center', flexDirection: 'row', gap: 12 },
})

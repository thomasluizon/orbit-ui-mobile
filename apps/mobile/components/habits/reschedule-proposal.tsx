import { StyleSheet, Text, View } from 'react-native'
import { CalendarClock } from '@/components/ui/icons'
import { Proposed } from '@/components/ui/proposed'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface RescheduleProposalProps {
  proposedLabel: string
  dateLabel: string
  timeLabel: string | null
  scheduleLabel: string
  rationale: string
  disclosure: string
}

/** Reusable Astra reschedule proposal shared by Hoje and the habit detail surface. */
export function RescheduleProposal({
  proposedLabel,
  dateLabel,
  timeLabel,
  scheduleLabel,
  rationale,
  disclosure,
}: Readonly<RescheduleProposalProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View style={styles.root}>
      <Proposed proposed scope="block" label={proposedLabel}>
        <View style={styles.card}>
          <CalendarClock size={20} color={tokens.fg3} strokeWidth={1.9} />
          <View style={styles.copy}>
            <Text style={[styles.label, { color: tokens.fg3 }]}>{proposedLabel}</Text>
            <Text testID="reschedule-proposed-schedule" style={[styles.value, { color: tokens.fg1 }]}>
              {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
            </Text>
            <Text style={[styles.schedule, { color: tokens.fg3 }]}>{scheduleLabel}</Text>
          </View>
        </View>
      </Proposed>
      <Text style={[styles.rationale, { color: tokens.fg1 }]}>{rationale}</Text>
      <Text style={[styles.disclosure, { color: tokens.fg3 }]}>{disclosure}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  copy: { flex: 1 },
  label: { fontFamily: 'Rubik_500Medium', fontSize: 12, letterSpacing: 0.5, textTransform: 'uppercase' },
  value: { fontFamily: 'Rubik_500Medium', fontSize: 16, marginTop: 4 },
  schedule: { fontFamily: 'Rubik_400Regular', fontSize: 14, marginTop: 4 },
  rationale: { fontFamily: 'Rubik_400Regular', fontSize: 14, lineHeight: 20 },
  disclosure: { fontFamily: 'Rubik_400Regular', fontSize: 12, lineHeight: 18 },
})

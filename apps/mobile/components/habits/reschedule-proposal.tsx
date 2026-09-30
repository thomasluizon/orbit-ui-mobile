import { StyleSheet, Text, View } from 'react-native'
import { Proposed } from '@/components/ui/proposed'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

export interface RescheduleProposalProps {
  proposedLabel: string
  dateLabel: string
  timeLabel: string | null
  scheduleLabel: string | null
  rationale: string
  disclosure: string
}

/** The Astra reschedule proposal inside the Hoje reschedule sheet. */
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
        <View style={[styles.card, { backgroundColor: tokens.bgCard, borderColor: tokens.hairlineGhost }]}>
          <Text testID="reschedule-proposed-schedule" style={[styles.value, { color: tokens.fg1 }]}>
            {dateLabel}{timeLabel ? ` · ${timeLabel}` : ''}
          </Text>
          {scheduleLabel ? <Text style={[styles.schedule, { color: tokens.fg2 }]}>{scheduleLabel}</Text> : null}
        </View>
      </Proposed>
      <Text style={[styles.rationale, { color: tokens.fg2 }]}>{rationale}</Text>
      <Text style={[styles.disclosure, { color: tokens.fg3 }]}>{disclosure}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  card: { gap: 4, padding: 24, borderRadius: 20, borderWidth: 1 },
  value: { fontFamily: 'SpaceGrotesk_500Medium', fontSize: 20, fontVariant: ['tabular-nums'] },
  schedule: { fontFamily: 'Geist_400Regular', fontSize: 14 },
  rationale: { fontFamily: 'Geist_400Regular', fontSize: 14, lineHeight: 22 },
  disclosure: { fontFamily: 'Geist_400Regular', fontSize: 12, lineHeight: 18 },
})

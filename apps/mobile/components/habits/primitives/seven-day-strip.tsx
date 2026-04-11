import { StyleSheet, View } from 'react-native'
import type { SevenDayStripCell } from '@orbit/shared/utils'
import { computeSevenDayStrip } from '@orbit/shared/utils'
import type { NormalizedHabit } from '@orbit/shared/types/habit'

interface SevenDayStripProps {
  habit: Pick<NormalizedHabit, 'instances'>
  accentColor: string
  today?: Date
}

export function SevenDayStrip({ habit, accentColor, today }: Readonly<SevenDayStripProps>) {
  const cells = computeSevenDayStrip(habit, today)

  return (
    <View style={styles.row}>
      {cells.map((cell) => (
        <Dot key={cell.date} cell={cell} accentColor={accentColor} />
      ))}
    </View>
  )
}

function Dot({
  cell,
  accentColor,
}: Readonly<{ cell: SevenDayStripCell; accentColor: string }>) {
  if (cell.status === 'done') {
    return <View style={[styles.dot, { backgroundColor: accentColor }]} />
  }
  if (cell.status === 'missed') {
    return (
      <View
        style={[
          styles.dot,
          { borderColor: 'rgba(248,113,113,0.4)', backgroundColor: 'rgba(239,68,68,0.1)' },
        ]}
      />
    )
  }
  if (cell.status === 'today-pending') {
    return (
      <View
        style={[
          styles.dot,
          {
            borderColor: accentColor,
            borderStyle: 'dashed',
            borderWidth: 2,
          },
        ]}
      />
    )
  }
  if (cell.status === 'future') {
    return <View style={[styles.dot, { borderColor: 'rgba(255,255,255,0.12)' }]} />
  }
  return <View style={[styles.dot, styles.notScheduled]} />
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  notScheduled: {
    borderColor: 'rgba(255,255,255,0.08)',
    opacity: 0.5,
  },
})

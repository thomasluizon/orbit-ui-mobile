import { StyleSheet, Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'

interface StreakFlameMiniProps {
  streak: number
}

interface TierPalette {
  color: string
  bg: string
  border: string
}

function tierPalette(streak: number): TierPalette {
  if (streak >= 100) {
    return { color: '#fcd34d', bg: 'rgba(251,191,36,0.12)', border: 'rgba(252,211,77,0.3)' }
  }
  if (streak >= 30) {
    return { color: '#fb923c', bg: 'rgba(249,115,22,0.12)', border: 'rgba(251,146,60,0.25)' }
  }
  if (streak >= 7) {
    return { color: '#fb923c', bg: 'rgba(249,115,22,0.1)', border: 'rgba(251,146,60,0.18)' }
  }
  return { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.15)' }
}

export function StreakFlameMini({ streak }: Readonly<StreakFlameMiniProps>) {
  if (streak < 2) return null
  const { color, bg, border } = tierPalette(streak)

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: bg, borderColor: border },
      ]}
      accessibilityLabel={`${streak} day streak`}
    >
      <Flame size={11} color={color} />
      <Text style={[styles.label, { color }]}>{streak}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
})

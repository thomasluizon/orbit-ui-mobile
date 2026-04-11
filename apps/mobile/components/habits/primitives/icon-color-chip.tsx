import { StyleSheet, Text, View } from 'react-native'
import { resolveHabitIcon } from '@/lib/habit-icon-catalog'

interface IconColorChipProps {
  icon?: string | null
  color: string
  title: string
  size?: number
}

export function IconColorChip({
  icon,
  color,
  title,
  size = 40,
}: Readonly<IconColorChipProps>) {
  const Icon = resolveHabitIcon(icon)
  const iconSize = Math.round(size * 0.5)
  const fontSize = Math.round(iconSize * 0.75)

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          backgroundColor: `${color}24`,
          borderColor: `${color}40`,
        },
      ]}
    >
      {Icon ? (
        <Icon size={iconSize} color={color} strokeWidth={2} />
      ) : (
        <Text style={[styles.initial, { color, fontSize }]}>
          {title.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontWeight: '800',
  },
})

import type { PlanCardProps } from '@orbit/shared/contracts/display'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** Selectable plan card with the accent reserved for the chosen state. */
export function PlanCard({ name, badge, price, selected = false, onClick }: Readonly<PlanCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onClick}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.card,
        selected
          ? {
              backgroundColor: tintFromPrimary(tokens, 0.1),
              borderWidth: 1.5,
              borderColor: tokens.primary,
            }
          : {
              backgroundColor: pressed ? tokens.bgElev : tokens.bgCard,
              borderWidth: 1.5,
              borderColor: pressed ? tokens.hairlineStrong : tokens.hairline,
            },
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.nameRow}>
        <Text style={[styles.name, { color: tokens.fg1 }]}>{name}</Text>
        {badge}
      </View>
      <Text style={[styles.price, { color: tokens.fg1 }]}>{price}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  name: {
    fontFamily: 'Geist_500Medium',
    fontSize: 16,
  },
  price: {
    fontFamily: 'SpaceGrotesk_600SemiBold',
    fontSize: 22,
  },
})

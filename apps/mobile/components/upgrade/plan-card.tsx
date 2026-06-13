import { Check } from 'lucide-react-native'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Badge } from '@/components/ui/badge'
import { createTokensV2, radius, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface PlanCardProps {
  name: string
  badge?: string
  price: string
  sub?: string
  features?: string[]
  selected: boolean
  onSelect: () => void
}

/** Kit plan card: selectable radio card with name, badge, Inter price, and feature checklist. */
export function PlanCard({
  name,
  badge,
  price,
  sub,
  features = [],
  selected,
  onSelect,
}: Readonly<PlanCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <Pressable
      onPress={onSelect}
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
              borderWidth: 1,
              borderColor: pressed ? tokens.hairlineStrong : tokens.hairline,
            },
        pressed ? styles.cardPressed : null,
      ]}
    >
      <View style={styles.headerRow}>
        <View style={styles.headerBody}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: tokens.fg1 }]}>{name}</Text>
            {badge ? <Badge>{badge}</Badge> : null}
          </View>
          <Text style={[styles.price, { color: tokens.fg1 }]}>{price}</Text>
          {sub ? <Text style={[styles.sub, { color: tokens.fg3 }]}>{sub}</Text> : null}
        </View>
        <View
          style={[
            styles.radio,
            selected
              ? { backgroundColor: tokens.primary }
              : { borderWidth: 2, borderColor: tokens.fg3 },
          ]}
        >
          {selected ? (
            <View style={[styles.radioDot, { backgroundColor: tokens.fgOnPrimary }]} />
          ) : null}
        </View>
      </View>
      {features.length > 0 ? (
        <View style={styles.features}>
          {features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Check size={16} strokeWidth={2.4} color={tokens.primarySoft} />
              <Text style={[styles.featureText, { color: tokens.fg2 }]}>{feature}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerBody: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  name: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 20,
  },
  price: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
  },
  sub: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13,
    marginTop: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 9,
    height: 9,
    borderRadius: radius.full,
  },
  features: {
    marginTop: 14,
    gap: 9,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 14,
    flex: 1,
  },
})

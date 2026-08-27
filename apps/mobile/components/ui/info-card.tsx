import type { InfoCardProps } from '@orbit/shared/contracts/display'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

/** A quiet one-tone informational surface. */
export function InfoCard({ icon, children }: Readonly<InfoCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tokens.bgElev,
        },
      ]}
    >
      {icon ? <Text style={{ color: tokens.fg3 }}>{icon}</Text> : null}
      <View style={styles.body}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    borderRadius: 20,
    padding: 24,
  },
  body: {
    flex: 1,
  },
})

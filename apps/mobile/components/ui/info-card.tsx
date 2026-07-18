import type { ReactNode } from 'react'
import { Info, type LucideIcon } from '@/components/ui/icons'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface InfoCardProps {
  icon?: LucideIcon
  title: string
  desc?: string
  trailing?: ReactNode
}

/** Kit info card: primary-tinted bordered row with leading icon, title, and description. */
export function InfoCard({ icon: Icon = Info, title, desc, trailing }: Readonly<InfoCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tintFromPrimary(tokens, 0.18),
          borderColor: tintFromPrimary(tokens, 0.28),
        },
      ]}
    >
      <Icon size={24} strokeWidth={1.9} color={tokens.primarySoft} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: tokens.fg1 }]}>{title}</Text>
        {desc ? <Text style={[styles.desc, { color: tokens.fg3 }]}>{desc}</Text> : null}
      </View>
      {trailing}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  body: {
    flex: 1,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 16,
  },
  desc: {
    fontFamily: 'Rubik_400Regular',
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 4,
  },
})

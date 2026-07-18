import type { ReactNode } from 'react'
import { Info, type LucideIcon } from '@/components/ui/icons'
import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { typeRoleStyle } from '@/lib/type-roles'
import { useAppTheme } from '@/lib/use-app-theme'

/** How loudly an aside asserts itself: `quiet` recedes onto the elevated surface,
 *  `accent` is reserved for a call-out that is the focal element of its surface. */
export type InfoCardTone = 'quiet' | 'accent'

interface InfoCardProps {
  icon?: LucideIcon
  title: string
  desc?: string
  tone?: InfoCardTone
  trailing?: ReactNode
}

function surfaceForTone(tone: InfoCardTone, tokens: AppTokensV2) {
  return tone === 'accent'
    ? { background: tintFromPrimary(tokens, 0.14), icon: tokens.primarySoft }
    : { background: tokens.bgElev, icon: tokens.fg3 }
}

/** Kit info card: a borderless tonal aside. Title and description sit on the type-role
 *  scale so supporting copy recedes through colour and weight rather than through a ring. */
export function InfoCard({
  icon: Icon = Info,
  title,
  desc,
  tone = 'quiet',
  trailing,
}: Readonly<InfoCardProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const surface = surfaceForTone(tone, tokens)

  return (
    <View
      style={[
        styles.card,
        desc ? styles.cardTop : null,
        { backgroundColor: surface.background },
      ]}
    >
      <Icon size={22} strokeWidth={1.8} color={surface.icon} />
      <View style={styles.body}>
        <Text style={[typeRoleStyle('body', tokens), styles.title]}>{title}</Text>
        {desc ? (
          <Text style={[typeRoleStyle('secondary', tokens), styles.desc]}>{desc}</Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  cardTop: {
    alignItems: 'flex-start',
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: 'Rubik_500Medium',
  },
  desc: {
    marginTop: 4,
  },
  trailing: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
})

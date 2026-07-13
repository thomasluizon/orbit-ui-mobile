import { StyleSheet, Text, View } from 'react-native'
import { initialsOf } from '@orbit/shared/utils'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface UserAvatarProps {
  name: string
  size?: number
}

/** Generic initials avatar disc for friends and feed actors where no uploaded picture exists. */
export function UserAvatar({ name, size = 44 }: Readonly<UserAvatarProps>) {
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  return (
    <View
      style={[
        styles.disc,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tintFromPrimary(tokens, 0.14),
        },
      ]}
    >
      <Text style={[styles.initials, { color: tokens.primary, fontSize: Math.round(size * 0.4) }]}>
        {initialsOf(name)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontFamily: 'Rubik_600SemiBold' },
})

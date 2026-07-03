import { StyleSheet, Text, View } from 'react-native'
import { createTokensV2, tintFromPrimary } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface UserAvatarProps {
  name: string
  size?: number
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
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

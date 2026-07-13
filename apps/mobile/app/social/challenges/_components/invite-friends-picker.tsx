import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { useTranslation } from 'react-i18next'
import { UserAvatar } from '@/components/ui/user-avatar'
import { useFriends } from '@/hooks/use-friends'
import { createTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'

interface InviteFriendsPickerProps {
  selectedIds: string[]
  onToggle: (userId: string) => void
}

/** Multi-select over the user's accepted friends, used to invite them when creating a challenge. */
export function InviteFriendsPicker({ selectedIds, onToggle }: Readonly<InviteFriendsPickerProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)
  const { data } = useFriends()
  const friends = data?.friends ?? []
  const selectedIdSet = new Set(selectedIds)

  if (friends.length === 0) {
    return (
      <Text style={{ fontFamily: 'Rubik_400Regular', fontSize: 14, color: tokens.fg3 }}>
        {t('challenges.invite.empty')}
      </Text>
    )
  }

  return (
    <View style={styles.list}>
      {friends.map((friend) => {
        const active = selectedIdSet.has(friend.userId)
        return (
          <Pressable
            key={friend.userId}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={friend.displayName}
            onPress={() => onToggle(friend.userId)}
            style={({ pressed }) => [
              styles.row,
              pressed ? { backgroundColor: tokens.bgElev } : null,
            ]}
          >
            <UserAvatar name={friend.displayName} size={36} />
            <Text style={[styles.name, { color: tokens.fg1 }]} numberOfLines={1}>
              {friend.displayName}
            </Text>
            <View
              style={[
                styles.check,
                active
                  ? { backgroundColor: tokens.primary }
                  : { borderWidth: 1.5, borderColor: tokens.hairlineStrong },
              ]}
            >
              {active ? <Check size={14} strokeWidth={2.5} color={tokens.fgOnPrimary} /> : null}
            </View>
          </Pressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  list: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  name: { flex: 1, minWidth: 0, fontFamily: 'Rubik_400Regular', fontSize: 15 },
  check: {
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

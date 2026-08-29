import { Text, Pressable } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Pencil } from '@/components/ui/icons'
import type { createTokensV2 } from '@/lib/theme'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { sectionEntrance } from '@/components/profile/profile-section-entrance'
import type { ProfileStyles } from './profile-styles'

type Tokens = ReturnType<typeof createTokensV2>

interface ProfileIdentityProps {
  isLoading: boolean
  showBadge: boolean
  badgeLabel: string
  name: string | undefined
  identityLine: string | undefined
  tokens: Tokens
  styles: ProfileStyles
  onEditName: () => void
}

export function ProfileIdentity({
  isLoading,
  showBadge,
  badgeLabel,
  name,
  identityLine,
  tokens,
  styles,
  onEditName,
}: Readonly<ProfileIdentityProps>) {
  const { t } = useTranslation()
  return (
    <Animated.View entering={sectionEntrance(0)} style={styles.identityBlock}>
      {isLoading ? (
        <Skeleton variant="settings" label={t('common.loading')} />
      ) : (
        <>
          {showBadge ? (
            <Badge  >
              {badgeLabel}
            </Badge>
          ) : null}
          <Pressable
            onPress={onEditName}
            accessibilityRole="button"
            accessibilityLabel={t('profile.editName.title')}
            hitSlop={8}
            style={({ pressed }) => [
              styles.identityNameButton,
              pressed ? styles.identityNamePressed : null,
            ]}
          >
            <Text
              style={[styles.identityName, { color: tokens.fg1 }]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Pencil size={16} strokeWidth={1.8} color={tokens.fg3} />
          </Pressable>
          <Text
            style={[styles.identityLine, { color: tokens.fg2 }]}
            numberOfLines={1}
          >
            {identityLine}
          </Text>
        </>
      )}
    </Animated.View>
  )
}

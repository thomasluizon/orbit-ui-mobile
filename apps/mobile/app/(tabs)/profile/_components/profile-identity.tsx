import { Text, Pressable } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react-native'
import type { createTokensV2 } from '@/lib/theme'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { SkeletonLine } from '@/components/ui/skeleton'
import { sectionEntrance } from './profile-section-entrance'
import type { ProfileStyles } from './profile-styles'

type Tokens = ReturnType<typeof createTokensV2>

interface ProfileIdentityProps {
  isLoading: boolean
  showBadge: boolean
  badgeTone: BadgeTone
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
  badgeTone,
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
        <>
          <SkeletonLine width={76} height={22} style={styles.skeletonBadge} />
          <SkeletonLine width={160} height={30} style={styles.skeletonName} />
          <SkeletonLine width={120} height={14} />
        </>
      ) : (
        <>
          {showBadge ? (
            <Badge tone={badgeTone} style={styles.planBadge}>
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

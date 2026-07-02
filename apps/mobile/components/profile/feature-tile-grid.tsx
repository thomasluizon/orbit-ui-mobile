import type { RefObject } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react-native'
import {
  isProfileNavItemLocked,
  type ProfileNavIconKey,
  type ProfileNavItem,
} from '@orbit/shared/utils/profile-navigation'
import type { Profile } from '@orbit/shared/types/profile'
import { createTokensV2, tintFromPrimary, type AppTokensV2 } from '@/lib/theme'
import { useAppTheme } from '@/lib/use-app-theme'
import { ProBadge } from '@/components/ui/pro-badge'
import { ProfileNavIcon } from './profile-nav-icon'

type FeatureTileGridProfile = Pick<
  Profile,
  'hasProAccess' | 'isLifetimePro' | 'subscriptionInterval'
>

interface FeatureTileGridProps {
  items: ProfileNavItem[]
  profile: FeatureTileGridProfile | null | undefined
  onItemSelect: (item: ProfileNavItem) => void
  onTourReplay: () => void
  tourTargetRefs?: Partial<Record<string, RefObject<View | null>>>
}

interface FeatureTileConfig {
  id: string
  iconKey: ProfileNavIconKey
  label: string
  locked: boolean
  proBadge: boolean
  onPress: () => void
  tourRef?: RefObject<View | null>
}

/**
 * 2-column icon-tile grid of feature destinations: kit stat-tile affordance
 * (radius 18, translucent fill, inset hairline ring) with a 22/1.8 icon, a Rubik
 * label, and a lock badge or PRO pill on gated items. Leads with the tour-replay
 * tile. Fed by the PROFILE_NAV_ITEMS features config on the Profile screen.
 */
export function FeatureTileGrid({
  items,
  profile,
  onItemSelect,
  onTourReplay,
  tourTargetRefs,
}: Readonly<FeatureTileGridProps>) {
  const { t } = useTranslation()
  const { currentScheme, currentTheme } = useAppTheme()
  const tokens = createTokensV2(currentScheme, currentTheme)

  const tiles: FeatureTileConfig[] = [
    {
      id: 'tour-replay',
      iconKey: 'compass',
      label: t('tour.replay.title'),
      locked: false,
      proBadge: false,
      onPress: onTourReplay,
    },
    ...items.map((item) => ({
      id: item.id,
      iconKey: item.iconKey,
      label: t(item.titleKey),
      locked: isProfileNavItemLocked(item, profile),
      proBadge: item.proBadge,
      onPress: () => onItemSelect(item),
      tourRef: tourTargetRefs?.[item.id],
    })),
  ]

  const rows: FeatureTileConfig[][] = []
  for (let index = 0; index < tiles.length; index += 2) {
    rows.push(tiles.slice(index, index + 2))
  }

  return (
    <View style={styles.grid}>
      {rows.map((row) => (
        <View key={row.map((tile) => tile.id).join('-')} style={styles.row}>
          {row.map((tile) => (
            <FeatureTile
              key={tile.id}
              tile={tile}
              tokens={tokens}
              lockedLabel={t('common.locked')}
              proBadgeLabel={t('common.proBadge')}
            />
          ))}
          {row.length === 1 ? <View style={styles.tileWrap} /> : null}
        </View>
      ))}
    </View>
  )
}

function FeatureTile({
  tile,
  tokens,
  lockedLabel,
  proBadgeLabel,
}: Readonly<{
  tile: FeatureTileConfig
  tokens: AppTokensV2
  lockedLabel: string
  proBadgeLabel: string
}>) {
  return (
    <View
      ref={tile.tourRef}
      collapsable={tile.tourRef ? false : undefined}
      style={styles.tileWrap}
    >
      <Pressable
        onPress={tile.onPress}
        accessibilityRole="button"
        accessibilityLabel={tile.locked ? `${tile.label}, ${lockedLabel}` : tile.label}
        style={({ pressed }) => [
          styles.tile,
          { backgroundColor: tokens.bgField, borderColor: tokens.hairline },
          pressed ? styles.tilePressed : null,
        ]}
      >
        <ProfileNavIcon iconKey={tile.iconKey} color={tokens.fg1} />
        <Text style={[styles.label, { color: tokens.fg1 }]} numberOfLines={2}>
          {tile.label}
        </Text>
        {tile.locked ? (
          <View
            style={[styles.lockBadge, { backgroundColor: tintFromPrimary(tokens, 0.12) }]}
          >
            <Lock size={12} strokeWidth={2} color={tokens.primary} />
          </View>
        ) : tile.proBadge ? (
          <ProBadge alwaysVisible label={proBadgeLabel} style={styles.proBadge} />
        ) : null}
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  grid: {
    gap: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 14,
  },
  tileWrap: {
    flex: 1,
  },
  tile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 96,
    paddingTop: 18,
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  tilePressed: {
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontFamily: 'Rubik_500Medium',
    fontSize: 15,
    lineHeight: 19.5,
    textAlign: 'center',
  },
  lockBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  proBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
  },
})

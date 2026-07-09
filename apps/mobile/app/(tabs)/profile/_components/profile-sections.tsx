import { type RefObject } from 'react'
import { View } from 'react-native'
import Animated from 'react-native-reanimated'
import { useTranslation } from 'react-i18next'
import { CreditCard } from 'lucide-react-native'
import type { Profile } from '@orbit/shared/types/profile'
import {
  PROFILE_NAV_ITEMS,
  resolveProfileNavHint,
  type ProfileNavItem,
  type ProfileNavHintContext,
} from '@orbit/shared/utils/profile-navigation'
import type { createTokensV2 } from '@/lib/theme'
import { SectionLabel } from '@/components/ui/section-label'
import { SettingsGroup, SettingsGroupRow } from '@/components/ui/settings-group'
import { ProfileNavIcon } from '@/components/profile/profile-nav-icon'
import { sectionEntrance } from './profile-section-entrance'
import type { ProfileStyles } from './profile-styles'

type Tokens = ReturnType<typeof createTokensV2>

const PROFILE_FEATURE_SECTIONS = [
  { labelKey: 'nav.social', ids: ['social'] },
  { labelKey: 'explore.sections.progress', ids: ['retrospective', 'wrapped'] },
  { labelKey: 'explore.sections.integrations', ids: ['calendar-sync'] },
  { labelKey: 'explore.sections.more', ids: ['about', 'advanced'] },
].map((section) => ({
  labelKey: section.labelKey,
  items: PROFILE_NAV_ITEMS.filter((item) => section.ids.includes(item.id)),
}))

interface ProfileSectionsProps {
  accountNavItems: ProfileNavItem[]
  profile: Profile | undefined
  gamificationProfile: ProfileNavHintContext['gamificationProfile']
  subscriptionLabel: string
  subscriptionHint: string
  tokens: Tokens
  styles: ProfileStyles
  preferencesRef: RefObject<View | null>
  retroRef: RefObject<View | null>
  subscriptionRef: RefObject<View | null>
  onNavPress: (item: ProfileNavItem) => void
  onUpgrade: () => void
  onShowTourReplay: () => void
}

export function ProfileSections({
  accountNavItems,
  profile,
  gamificationProfile,
  subscriptionLabel,
  subscriptionHint,
  tokens,
  styles,
  preferencesRef,
  retroRef,
  subscriptionRef,
  onNavPress,
  onUpgrade,
  onShowTourReplay,
}: Readonly<ProfileSectionsProps>) {
  const { t } = useTranslation()
  const hintContext: ProfileNavHintContext = {
    hasProAccess: profile?.hasProAccess,
    gamificationProfile,
  }
  return (
    <>
      <Animated.View entering={sectionEntrance(4)}>
        <SectionLabel>{t('profile.sections.account')}</SectionLabel>
        <View style={styles.groupWrap}>
          <SettingsGroup>
            {accountNavItems.map((item) => (
              <View
                key={item.id}
                ref={item.id === 'preferences' ? preferencesRef : undefined}
                collapsable={false}
              >
                <SettingsGroupRow
                  icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg1} />}
                  label={t(item.titleKey)}
                  hint={resolveProfileNavHint(item, hintContext, t)}
                  onPress={() => onNavPress(item)}
                  proBadge={item.proBadge}
                  proBadgeLabel={t('common.proBadge')}
                />
              </View>
            ))}
          </SettingsGroup>
        </View>
      </Animated.View>

      <Animated.View entering={sectionEntrance(5)}>
        <SectionLabel>{t('explore.sections.discover')}</SectionLabel>
        <View style={styles.groupWrap}>
          <SettingsGroup>
            <SettingsGroupRow
              icon={<ProfileNavIcon iconKey="compass" color={tokens.fg1} />}
              label={t('tour.replay.title')}
              hint={t('explore.tourHint')}
              onPress={onShowTourReplay}
            />
          </SettingsGroup>
        </View>
      </Animated.View>

      {PROFILE_FEATURE_SECTIONS.map((section, sectionIndex) => (
        <Animated.View
          key={section.labelKey}
          entering={sectionEntrance(6 + sectionIndex)}
        >
          <SectionLabel>{t(section.labelKey)}</SectionLabel>
          <View style={styles.groupWrap}>
            <SettingsGroup>
              {section.items.map((item) => (
                <View
                  key={item.id}
                  ref={item.id === 'retrospective' ? retroRef : undefined}
                  collapsable={false}
                >
                  <SettingsGroupRow
                    icon={<ProfileNavIcon iconKey={item.iconKey} color={tokens.fg1} />}
                    label={t(item.titleKey)}
                    hint={resolveProfileNavHint(item, hintContext, t)}
                    onPress={() => onNavPress(item)}
                    proBadge={item.proBadge}
                    proBadgeLabel={t('common.proBadge')}
                  />
                </View>
              ))}
            </SettingsGroup>
          </View>
        </Animated.View>
      ))}

      <Animated.View entering={sectionEntrance(10)}>
        <SectionLabel>{t('profile.sections.subscription')}</SectionLabel>
        <View ref={subscriptionRef} collapsable={false} style={styles.groupWrap}>
          <SettingsGroup>
            <SettingsGroupRow
              icon={<CreditCard size={22} color={tokens.fg1} strokeWidth={1.8} />}
              label={t('profile.subscription.plan')}
              accessibilityLabel={
                profile?.hasProAccess && !profile.isTrialActive
                  ? t('profile.subscription.manage')
                  : t('common.upgrade')
              }
              hint={`${subscriptionLabel} · ${subscriptionHint}`}
              onPress={onUpgrade}
            />
          </SettingsGroup>
        </View>
      </Animated.View>
    </>
  )
}

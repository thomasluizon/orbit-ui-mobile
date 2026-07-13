'use client'

import { ReferralCard } from '@/components/referral/referral-card'
import { ReferralDrawer } from '@/components/referral/referral-drawer'
import { ProfileIdentityHeader } from './_components/profile-identity-header'
import { ProfileStatTiles } from './_components/profile-stat-tiles'
import { NextRewardCarrot } from './_components/next-reward-carrot'
import { ProfileNavSections } from './_components/profile-nav-sections'
import { ProfileFeatureSections } from './_components/profile-feature-sections'
import { ProfileSubscriptionSection } from './_components/profile-subscription-section'
import { ProfileAccountActions } from './_components/profile-account-actions'
import { ProfileHeaderBar } from './_components/profile-header-bar'
import { ProfileModals } from './_components/profile-modals'
import { useProfileScreen } from './_components/use-profile-screen'

export default function ProfilePage() {
  const screen = useProfileScreen()

  return (
    <div className="relative">
      {!screen.isDesktop && (
        <ProfileHeaderBar streak={screen.streak} error={screen.error} />
      )}

      <div className="stagger-enter">
        <ProfileIdentityHeader
          isLoading={screen.isLoading}
          showPlanBadge={!!screen.showPlanBadge}
          planBadgeTone={screen.planBadgeTone}
          planBadgeLabel={screen.planBadgeLabel}
          name={screen.profile?.name}
          identityLine={screen.identityLine}
          onEditName={() => screen.setShowEditName(true)}
        />
        <ProfileStatTiles
          streak={screen.streak}
          achievementsValue={screen.achievementsTileValue}
          achievementsLocked={screen.achievementsLocked}
          showAchievements={!!screen.achievementsNavItem}
          achievementsDataTour={
            screen.achievementsNavItem
              ? screen.navTourMap[screen.achievementsNavItem.id]
              : undefined
          }
          isLoading={screen.statsLoading}
          onStreakClick={screen.handleStreakClick}
          onAchievementsClick={screen.handleAchievementsClick}
        />
        <ReferralCard onOpen={() => screen.setShowReferral(true)} />
        <NextRewardCarrot carrot={screen.nextRewardCarrot} />
        <ProfileNavSections
          accountNavItems={screen.accountNavItems}
          navTourMap={screen.navTourMap}
          hasProAccess={screen.profile?.hasProAccess}
          gamificationProfile={screen.gamificationProfile}
          onNavClick={screen.handleNavClick}
        />
        {!screen.isDesktop && (
          <ProfileFeatureSections
            hasProAccess={screen.profile?.hasProAccess}
            gamificationProfile={screen.gamificationProfile}
            navTourMap={screen.navTourMap}
            onNavClick={screen.handleNavClick}
            onTourReplay={() => screen.setShowTourReplay(true)}
          />
        )}
        <ProfileSubscriptionSection
          profile={screen.profile}
          trialDaysLeft={screen.trialDaysLeft}
          trialExpired={screen.trialExpired}
        />
        <ProfileAccountActions
          isExporting={screen.isExporting}
          exportError={screen.exportError}
          displayName={screen.profile?.name}
          onExport={() => {
            void screen.exportData()
          }}
          onFreshStart={() => screen.setShowResetModal(true)}
          onDeleteAccount={() => screen.setShowDeleteModal(true)}
          onLogout={() => void screen.logout()}
        />
      </div>

      <div style={{ height: 24 }} />

      <ProfileModals
        profile={screen.profile}
        showEditName={screen.showEditName}
        showResetModal={screen.showResetModal}
        showDeleteModal={screen.showDeleteModal}
        showTourReplay={screen.showTourReplay}
        onEditNameChange={screen.setShowEditName}
        onResetChange={screen.setShowResetModal}
        onDeleteChange={screen.setShowDeleteModal}
        onTourReplayChange={screen.setShowTourReplay}
      />

      <ReferralDrawer open={screen.showReferral} onOpenChange={screen.setShowReferral} />
    </div>
  )
}

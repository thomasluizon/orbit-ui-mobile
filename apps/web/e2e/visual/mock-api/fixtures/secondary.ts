import type { ReferralDashboard } from '@orbit/shared/types/referral'
import type { NotificationsResponse } from '@orbit/shared/types/notification'

/**
 * The layout's always-mounted ReferralPrompt reads `dashboard.stats.discountPercent`
 * off the cached dashboard, so a full, schema-valid dashboard must be served (an empty
 * catch-all body would crash the surface).
 */
export const referralDashboardFixture = {
  code: 'PREVIEW',
  link: 'https://app.useorbit.org/r/PREVIEW',
  stats: {
    referralCode: 'PREVIEW',
    referralLink: 'https://app.useorbit.org/r/PREVIEW',
    successfulReferrals: 0,
    pendingReferrals: 0,
    maxReferrals: 10,
    rewardType: 'discount',
    discountPercent: 10,
  },
} satisfies ReferralDashboard

/** No notifications — the bell renders its empty state with no unread badge. */
export const notificationsFixture = {
  items: [],
  unreadCount: 0,
} satisfies NotificationsResponse

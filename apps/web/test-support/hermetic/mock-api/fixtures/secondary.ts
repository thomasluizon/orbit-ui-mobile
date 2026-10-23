import type { ReferralDashboard } from '@orbit/shared/types/referral'
import type { NotificationsResponse } from '@orbit/shared/types/notification'

export const referralDashboardFixture = {
  code: 'PREVIEW',
  link: 'https://app.useorbit.org/r/PREVIEW',
  stats: {
    referralCode: 'PREVIEW',
    referralLink: 'https://app.useorbit.org/r/PREVIEW',
    successfulReferrals: 0,
    pendingReferrals: 0,
    maxReferrals: 10,
    rewardType: 'pro_days',
    discountPercent: 10,
    proDaysPerReferral: 7,
  },
} satisfies ReferralDashboard

/** No notifications, so the bell renders its empty state with no unread badge. */
export const notificationsFixture = {
  items: [],
  unreadCount: 0,
} satisfies NotificationsResponse

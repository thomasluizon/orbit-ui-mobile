import { z } from 'zod'

export const referralCodeSchema = z.object({
  code: z.string(),
  link: z.string(),
})

export type ReferralCode = z.infer<typeof referralCodeSchema>

export const referralStatsSchema = z.object({
  referralCode: z.string().nullable(),
  referralLink: z.string().nullable(),
  successfulReferrals: z.number(),
  pendingReferrals: z.number(),
  maxReferrals: z.number(),
  rewardType: z.string(),
  discountPercent: z.number(),
})

export type ReferralStats = z.infer<typeof referralStatsSchema>

export const referralDashboardSchema = z.object({
  code: z.string(),
  link: z.string(),
  stats: referralStatsSchema,
})

export type ReferralDashboard = z.infer<typeof referralDashboardSchema>

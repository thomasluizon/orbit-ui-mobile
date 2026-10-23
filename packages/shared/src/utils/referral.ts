import type { ReferralStats } from '../types/referral'

const REFERRAL_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/

type RewardStats = Partial<Pick<ReferralStats, 'rewardType' | 'proDaysPerReferral' | 'discountPercent'>>

export type ReferralReward =
  | { kind: 'proDays'; values: { proDays: number } }
  | { kind: 'discount'; values: { discountPercent: number } }
  | { kind: 'neutral'; values: Record<string, never> }

export const REFERRAL_REWARD_COPY_KEYS = {
  proDays: { rewardKey: 'referral.reward.proDays', shareKey: 'referral.share.proDays' },
  discount: { rewardKey: 'referral.reward.discount', shareKey: 'referral.share.discount' },
  neutral: { rewardKey: 'referral.reward.neutral', shareKey: 'referral.share.neutral' },
} as const satisfies Record<ReferralReward['kind'], { rewardKey: string; shareKey: string }>

export function selectReferralReward(stats: RewardStats | null | undefined): ReferralReward {
  const days = stats?.proDaysPerReferral
  if (stats?.rewardType === 'pro_days' && days !== undefined && Number.isSafeInteger(days) && days > 0) {
    return { kind: 'proDays', values: { proDays: days } }
  }
  const percent = stats?.discountPercent
  if (stats?.rewardType === 'discount' && percent !== undefined && Number.isSafeInteger(percent) && percent > 0 && percent <= 100) {
    return { kind: 'discount', values: { discountPercent: percent } }
  }
  return { kind: 'neutral', values: {} }
}

/** Whether a value looks like a referral/invite code (URL-safe token shape). */
export function isValidReferralCode(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && REFERRAL_CODE_PATTERN.test(value)
}

export function buildReferralUrl(
  code: string | null | undefined,
  origin = 'https://app.useorbit.org',
): string {
  if (!code) {
    return ''
  }

  return `${origin}/r/${code}`
}

export function buildRecapShareUrl(
  code: string | null | undefined,
  period: string,
  origin = 'https://app.useorbit.org',
): string {
  if (!code) {
    return ''
  }

  return `${origin}/r/${code}?recap=${period}`
}

export function withShareLinkOrigin(link: string, origin: string): string {
  if (!link) return link
  const url = new URL(link)
  const targetOrigin = new URL(origin).origin
  if (url.origin === targetOrigin) return link
  return `${targetOrigin}${url.pathname}${url.search}${url.hash}`
}

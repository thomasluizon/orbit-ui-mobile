import type { ColorScheme } from '../theme'
import type { AgentPolicyDenial } from '../types/ai'
import {
  extractBackendError,
  extractBackendErrorCode,
  extractBackendStatus,
} from './error-utils'
import { getIsYearlyPro } from './profile-selectors'

export type UpgradeEntitlementRequirement = 'pro' | 'yearlyPro'
export type UpgradeEntitlementMode = 'redirect' | 'mixed'

export interface UpgradeAccessSnapshot {
  hasProAccess: boolean
  isLifetimePro?: boolean | null
  subscriptionInterval?: string | null
}

export interface UpgradeEntitlementResolution {
  shouldUpgrade: boolean
  requirement: UpgradeEntitlementRequirement | null
  reason: string | null
}

export interface UpgradeDenialInput {
  status?: number | null
  code?: string | null
  reason?: string | null
}

export const DEFAULT_FREE_COLOR_SCHEME: ColorScheme = 'purple'

export function getUpgradeTierReservation(
  interval: 'monthly' | 'yearly',
  t: (key: string, params?: Record<string, string>) => string,
): {
  interval: 'monthly' | 'yearly'
  name: string
  price: string
  period: string
  heroLine: string | undefined
  secondLine: string | undefined
  couponLine: string
} {
  const pendingValue = t('upgrade.plans.loading')
  return {
    interval,
    name: t(`upgrade.plans.${interval}.name`),
    price: pendingValue,
    period: t(`upgrade.plans.${interval}.period`),
    heroLine: interval === 'yearly' ? t('upgrade.plans.yearly.heroLine') : undefined,
    secondLine: interval === 'yearly'
      ? t('upgrade.plans.yearly.equivalent', { price: pendingValue, percent: pendingValue })
      : undefined,
    couponLine: t('upgrade.plans.coupon.line', { percent: pendingValue }),
  }
}

function normalizeRequirement(
  requirement: string | null | undefined,
): UpgradeEntitlementRequirement | null {
  if (!requirement) return null

  const normalized = requirement.trim().toLowerCase()
  if (normalized === 'pro' || normalized === 'premium') {
    return 'pro'
  }
  if (
    normalized === 'yearlypro' ||
    normalized === 'yearly_pro' ||
    normalized === 'yearly-pro' ||
    normalized === 'yearly'
  ) {
    return 'yearlyPro'
  }

  return null
}

export function canAccessEntitlement(
  profile: UpgradeAccessSnapshot | null | undefined,
  requirement: UpgradeEntitlementRequirement | null | undefined,
): boolean {
  if (!requirement) return true
  if (!profile?.hasProAccess) return false
  if (requirement === 'pro') return true
  return getIsYearlyPro({
    hasProAccess: profile.hasProAccess,
    isLifetimePro: profile.isLifetimePro ?? false,
    subscriptionInterval:
      profile.subscriptionInterval === 'monthly' || profile.subscriptionInterval === 'yearly'
        ? profile.subscriptionInterval
        : null,
  })
}

export function resolveAccessibleColorScheme(
  colorScheme: string | null | undefined,
  hasProAccess: boolean,
): ColorScheme {
  const normalized = colorScheme as ColorScheme | null | undefined
  if (!normalized) return DEFAULT_FREE_COLOR_SCHEME
  if (!hasProAccess && normalized !== DEFAULT_FREE_COLOR_SCHEME) {
    return DEFAULT_FREE_COLOR_SCHEME
  }
  return normalized
}

function inferRequirementFromReason(reason: string | null | undefined): UpgradeEntitlementRequirement | null {
  if (!reason) return null

  const normalized = reason.trim()
  const parts = normalized.split(':')
  const explicitRequirement = normalizeRequirement(parts.at(-1))
  if (explicitRequirement) {
    return explicitRequirement
  }

  const lowerReason = normalized.toLowerCase()
  if (lowerReason.includes('yearly')) {
    return 'yearlyPro'
  }
  if (
    lowerReason.includes('plan_required') ||
    lowerReason.includes('feature_plan_required') ||
    lowerReason.includes('premium') ||
    lowerReason.includes('pro')
  ) {
    return 'pro'
  }

  return null
}

export function resolveUpgradeEntitlementDenial(
  input: UpgradeDenialInput,
): UpgradeEntitlementResolution {
  const requirement = inferRequirementFromReason(input.reason) ?? normalizeRequirement(input.code)
  const normalizedCode = input.code?.trim().toUpperCase() ?? null
  const normalizedReason = input.reason?.trim() ?? null

  if (requirement) {
    return {
      shouldUpgrade: true,
      requirement,
      reason: normalizedReason,
    }
  }

  if (normalizedCode === 'PAY_GATE') {
    return {
      shouldUpgrade: true,
      requirement: 'pro',
      reason: normalizedReason,
    }
  }

  if (input.status === 403 && normalizedReason) {
    const lowerReason = normalizedReason.toLowerCase()
    if (
      lowerReason.includes('premium') ||
      lowerReason.includes('pro') ||
      lowerReason.includes('yearly') ||
      lowerReason.includes('plan required') ||
      lowerReason.includes('upgrade')
    ) {
      return {
        shouldUpgrade: true,
        requirement: lowerReason.includes('yearly') ? 'yearlyPro' : 'pro',
        reason: normalizedReason,
      }
    }
  }

  return {
    shouldUpgrade: false,
    requirement: null,
    reason: normalizedReason,
  }
}

export function resolveUpgradeEntitlementFromError(
  error: unknown,
): UpgradeEntitlementResolution {
  return resolveUpgradeEntitlementDenial({
    status: extractBackendStatus(error) ?? null,
    code: extractBackendErrorCode(error) ?? null,
    reason: extractBackendError(error) ?? null,
  })
}

export function resolveUpgradeEntitlementFromPolicyDenial(
  denial: Pick<AgentPolicyDenial, 'reason'> | null | undefined,
): UpgradeEntitlementResolution {
  return resolveUpgradeEntitlementDenial({
    reason: denial?.reason ?? null,
  })
}

import type { ColorScheme } from '../theme'
import type { AgentPolicyDenial } from '../types/ai'
import type { Profile } from '../types/profile'
import {
  extractBackendError,
  extractBackendErrorCode,
  extractBackendStatus,
} from './error-utils'
import { getIsYearlyPro } from './profile-selectors'

export const TRIAL_EXPIRED_FEATURE_KEYS = [
  'trial.expired.unlimitedHabits',
  'trial.expired.aiChat',
  'trial.expired.allColors',
  'trial.expired.aiSummary',
  'trial.expired.subHabits',
  'trial.expired.goals',
  'trial.expired.calendar',
  'trial.expired.apiKeys',
  'trial.expired.slipAlerts',
  'trial.expired.achievements',
  'trial.expired.retrospective',
] as const

export type UpgradeEntitlementRequirement = 'pro' | 'yearlyPro'
export type UpgradeEntitlementMode = 'redirect' | 'mixed'

export type UpgradeIconKey =
  | 'flame'
  | 'messageSquare'
  | 'palette'
  | 'shieldCheck'
  | 'barChart3'

export interface UpgradeAccessSnapshot {
  hasProAccess: boolean
  isLifetimePro?: boolean | null
  subscriptionInterval?: string | null
}

export interface UpgradePlanFeature {
  key: string
  iconKey: UpgradeIconKey
}

export interface UpgradeFeatureMatrixRow {
  key: string
  iconKey: UpgradeIconKey
  type: 'boolean' | 'text'
  freeEnabled?: boolean
  proEnabled?: boolean
}

export interface UpgradeFeatureMatrixCategory {
  category: string
  features: UpgradeFeatureMatrixRow[]
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

export const UPGRADE_PRO_FEATURES: UpgradePlanFeature[] = [
  { key: 'unlimited', iconKey: 'flame' },
  { key: 'ai', iconKey: 'messageSquare' },
  { key: 'goals', iconKey: 'barChart3' },
  { key: 'calendarImport', iconKey: 'flame' },
  { key: 'apiKeys', iconKey: 'shieldCheck' },
  { key: 'slipAlerts', iconKey: 'shieldCheck' },
  { key: 'achievements', iconKey: 'flame' },
  { key: 'themes', iconKey: 'palette' },
  { key: 'adFree', iconKey: 'shieldCheck' },
]

export const UPGRADE_YEARLY_EXTRA_FEATURES: UpgradePlanFeature[] = [
  { key: 'retrospective', iconKey: 'barChart3' },
]

export const UPGRADE_FEATURE_CATEGORIES: UpgradeFeatureMatrixCategory[] = [
  {
    category: 'habits',
    features: [
      { key: 'habits', iconKey: 'flame', type: 'text' },
      {
        key: 'subHabits',
        iconKey: 'flame',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'goals',
        iconKey: 'barChart3',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
  {
    category: 'ai',
    features: [
      { key: 'ai', iconKey: 'messageSquare', type: 'text' },
      {
        key: 'aiMemory',
        iconKey: 'messageSquare',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'summary',
        iconKey: 'messageSquare',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'apiKeys',
        iconKey: 'shieldCheck',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'slipAlerts',
        iconKey: 'shieldCheck',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
  {
    category: 'insights',
    features: [
      {
        key: 'retrospective',
        iconKey: 'barChart3',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: false,
      },
      {
        key: 'achievements',
        iconKey: 'flame',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
  {
    category: 'personalization',
    features: [
      { key: 'colors', iconKey: 'palette', type: 'text' },
      {
        key: 'calendarImport',
        iconKey: 'flame',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'premiumColors',
        iconKey: 'palette',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
      {
        key: 'adFree',
        iconKey: 'shieldCheck',
        type: 'boolean',
        freeEnabled: false,
        proEnabled: true,
      },
    ],
  },
]

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

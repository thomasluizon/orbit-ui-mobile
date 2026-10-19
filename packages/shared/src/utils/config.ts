import type { AppConfig, FeatureFlag, FeatureKey } from '../types/config'
import type { PlanType } from '../types/profile'

export function isFeatureEnabled(
  config: AppConfig,
  key: FeatureKey,
  userPlan: PlanType,
): boolean {
  const flag: FeatureFlag | undefined = config.features[key]
  if (!flag?.enabled) {
    return false
  }

  if (flag.planRequirement === null) {
    return true
  }

  return userPlan === 'pro'
}

export function resolveFlag(config: AppConfig | undefined, key: FeatureKey): boolean {
  return config !== undefined
    && Object.hasOwn(config.features, key)
    && config.features[key]?.enabled === true
}

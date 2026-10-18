import type { AppConfig, FeatureFlag } from '../types/config'
import type { PlanType } from '../types/profile'

export function isFeatureEnabled(
  config: AppConfig,
  key: string,
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


export function resolveFlag(config: AppConfig | undefined, key: string): boolean {
  return config !== undefined
    && Object.hasOwn(config.features, key)
    && config.features[key]?.enabled === true
}

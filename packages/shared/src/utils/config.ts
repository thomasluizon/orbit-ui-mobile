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

  if (flag.plan === null) {
    return true
  }

  return userPlan === 'pro'
}

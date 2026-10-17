import type { AppConfig } from '../types/config'

export function resolveFlag(config: AppConfig | undefined, key: string): boolean {
  return config !== undefined
    && Object.hasOwn(config.features, key)
    && config.features[key]?.enabled === true
}

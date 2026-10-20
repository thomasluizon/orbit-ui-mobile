import type { FeatureKey } from '../types/config'
import type { isFeatureEnabled, resolveFlag } from './config'

type Assert<T extends true> = T

type Accepts<Key, Parameter> = Key extends Parameter ? true : false

export type FeatureKeyContract = [
  Assert<Accepts<'sub_habits', Parameters<typeof isFeatureEnabled>[1]>>,
  Assert<Accepts<'sub_habits', Parameters<typeof resolveFlag>[1]>>,
  Assert<Accepts<FeatureKey, Parameters<typeof isFeatureEnabled>[1]>>,
  Assert<Accepts<FeatureKey, Parameters<typeof resolveFlag>[1]>>,
  Assert<Accepts<'habits.subHabits', Parameters<typeof isFeatureEnabled>[1]> extends false ? true : false>,
  Assert<Accepts<'habits.subHabits', Parameters<typeof resolveFlag>[1]> extends false ? true : false>,
  Assert<Accepts<string, Parameters<typeof isFeatureEnabled>[1]> extends false ? true : false>,
  Assert<Accepts<string, Parameters<typeof resolveFlag>[1]> extends false ? true : false>,
]

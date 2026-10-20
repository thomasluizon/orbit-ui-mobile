import type { ComposerProps } from '@orbit/shared/contracts/composer'
import { Composer } from './composer'

declare const validProps: ComposerProps

export function ComposerMobileTypeContract() {
  const valid = <Composer {...validProps} />
  // @ts-expect-error the mobile mirror accepts only the shared contract
  const invalid = <Composer {...validProps} label="Composer" />
  return [valid, invalid]
}

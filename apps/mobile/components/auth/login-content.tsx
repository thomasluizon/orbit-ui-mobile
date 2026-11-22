
import type { AuthCallbackState } from '@orbit/shared/utils/auth-callback-failure'
import { GuidedLoginContent } from './guided-login'

export interface LoginCallback {
  provider?: 'apple' | 'google'
  state: AuthCallbackState
  onContinue: () => void
  loading?: boolean
}

/** Sign-in is the one-question flow. With it off, the current surface shows. */
export function LoginContent({ callback }: Readonly<{ callback?: LoginCallback }>) {
  return <GuidedLoginContent callback={callback} />
}

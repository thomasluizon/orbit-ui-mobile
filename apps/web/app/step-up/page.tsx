import { headers } from 'next/headers'
import { ACCOUNT_ID_HEADER } from '@/lib/auth-api'
import { Providers } from '@/lib/providers'
import { StepUpScreen } from './step-up-screen'

/**
 * Names the account before the client can.
 *
 * `/step-up` is outside `PUBLIC_PATHS`, so reaching this render means the proxy resolved a valid
 * session and already knows whose it is. The client does not: `useHeldAccountId` reads a module
 * variable that only the session monitor writes, and a cold load of this route starts it at null.
 * The record this screen reads is stored under the account, so a null account finds nothing and
 * sends the person back to Profile with their challenge still live.
 */
export default async function StepUpPage() {
  const serverAccountId = (await headers()).get(ACCOUNT_ID_HEADER)
  return (
    <Providers>
      <StepUpScreen serverAccountId={serverAccountId} />
    </Providers>
  )
}

import { headers } from 'next/headers'
import { ACCOUNT_ID_HEADER } from '@/lib/auth-api'
import { Providers } from '@/lib/providers'
import { StepUpScreen } from './step-up-screen'

/**
 * Names the account before the client can. `/step-up` is outside `PUBLIC_PATHS`, so reaching
 * this render means the proxy resolved a valid session and already knows whose it is.
 */
export default async function StepUpPage() {
  const serverAccountId = (await headers()).get(ACCOUNT_ID_HEADER)
  return (
    <Providers>
      <StepUpScreen serverAccountId={serverAccountId} />
    </Providers>
  )
}

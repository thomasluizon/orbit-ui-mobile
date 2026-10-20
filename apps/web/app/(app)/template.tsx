import { headers } from 'next/headers'
import { ACCOUNT_ID_HEADER } from '@/lib/auth-api'
import { RenderedAccountSeed } from './rendered-account-seed'

export default async function AppTemplate({ children }: Readonly<{ children: React.ReactNode }>) {
  const accountId = (await headers()).get(ACCOUNT_ID_HEADER)
  return <RenderedAccountSeed accountId={accountId}>{children}</RenderedAccountSeed>
}

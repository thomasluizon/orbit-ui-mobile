import { TurnstileBridge } from './turnstile-bridge'

export default async function TurnstileBridgePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ siteKey?: string }> }>) {
  const { siteKey } = await searchParams
  if (!siteKey) return null
  return <TurnstileBridge siteKey={siteKey} />
}

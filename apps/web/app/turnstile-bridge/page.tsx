import { TurnstileBridge } from './turnstile-bridge'

export default async function TurnstileBridgePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ siteKey?: string; theme?: string }> }>) {
  const { siteKey, theme } = await searchParams
  if (!siteKey) return null
  return <TurnstileBridge siteKey={siteKey} theme={theme === 'light' ? 'light' : 'dark'} />
}

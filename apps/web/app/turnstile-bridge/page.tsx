import { getRouteMetadata } from '@/lib/route-metadata'
import { supportedLocales } from '@orbit/shared/i18n'
import { TurnstileBridge } from './turnstile-bridge'

export function generateMetadata() {
  return getRouteMetadata('/turnstile-bridge')
}

export default async function TurnstileBridgePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ siteKey?: string; theme?: string; language?: string }> }>) {
  const { siteKey, theme, language } = await searchParams
  if (!siteKey) return null
  return <TurnstileBridge
    siteKey={siteKey}
    theme={theme === 'light' ? 'light' : 'dark'}
    language={supportedLocales.find((locale) => locale === language)}
  />
}
